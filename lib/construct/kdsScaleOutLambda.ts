import * as path from 'path'

import { Construct } from 'constructs'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import { aws_kinesis as kds } from 'aws-cdk-lib'
import { aws_logs as logs } from 'aws-cdk-lib'
import { aws_lambda_nodejs as node } from 'aws-cdk-lib'
import { aws_lambda as lambda } from 'aws-cdk-lib'
import { aws_iam as iam } from 'aws-cdk-lib'

interface KdsScaleOutLambdaProps {
  dataStream: kds.Stream
}

/**
 * ProvisionedモードのKDS DataStreamのシャード数を２倍にするLambda関数
 * 主にCW Alarm Actionでの使用を想定
 */
export class KdsScaleOutLambda extends Construct {
  public readonly func: lambda.Function

  constructor(scope: Construct, id: string, props: KdsScaleOutLambdaProps) {
    super(scope, id)

    /*
    * Lambda
    -------------------------------------------------------------------------- */
    // Layer
    const customlayer = new lambda.LayerVersion(this, 'CustomLayer', {
      removalPolicy: RemovalPolicy.DESTROY,
      code: lambda.Code.fromAsset(path.join('resources', 'layer', 'common')),
      compatibleArchitectures: [lambda.Architecture.X86_64, lambda.Architecture.ARM_64]
    })

    // Function
    this.func = new node.NodejsFunction(this, 'LambdaFunc', {
      entry: path.join('resources', 'lambda', 'kdsScaleOut', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
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
      loggingFormat: lambda.LoggingFormat.JSON,
      systemLogLevelV2: lambda.SystemLogLevel.WARN
    })

    // Log
    new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: `/aws/lambda/${this.func.functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })
  }
}
