import * as path from 'path'

import { Construct } from 'constructs'
import { type Stream } from 'aws-cdk-lib/aws-kinesis'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as lambda_ from 'aws-cdk-lib/aws-lambda'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'

interface KdsScaleOutLambdaProps {
  dataStream: Stream
}

/**
 * ProvisionedモードのKDS DataStreamのシャード数を２倍にするLambda関数
 * 主にCW Alarm Actionでの使用を想定
 */
export class KdsScaleOutLambda extends Construct {
  public readonly func: lambda_.Function

  constructor(scope: Construct, id: string, props: KdsScaleOutLambdaProps) {
    super(scope, id)

    /*
    * Lambda
    -------------------------------------------------------------------------- */
    // Layer
    const customlayer = new lambda_.LayerVersion(this, 'CustomLayer', {
      removalPolicy: RemovalPolicy.DESTROY,
      code: lambda_.Code.fromAsset(path.join('resources', 'layer', 'common')),
      compatibleArchitectures: [lambda_.Architecture.X86_64, lambda_.Architecture.ARM_64]
    })

    // Function
    this.func = new nodejsLambda.NodejsFunction(this, 'LambdaFunc', {
      entry: path.join('resources', 'lambda', 'kdsScaleOut', 'index.ts'),
      handler: 'handler',
      runtime: lambda_.Runtime.NODEJS_20_X,
      architecture: lambda_.Architecture.ARM_64,
      timeout: Duration.minutes(3),
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ['kinesis:DescribeStreamSummary', 'kinesis:UpdateShardCount'],
          resources: [props.dataStream.streamArn]
        })
      ],
      environment: {
        DATA_STREAM_NAME: props.dataStream.streamName
      },
      layers: [customlayer],
      loggingFormat: lambda_.LoggingFormat.JSON,
      systemLogLevel: lambda_.SystemLogLevel.WARN
    })

    // Log
    new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: `/aws/lambda/${this.func.functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })
  }
}
