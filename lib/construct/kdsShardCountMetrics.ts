import { RemovalPolicy, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { type Stream } from 'aws-cdk-lib/aws-kinesis'
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as lambda_ from 'aws-cdk-lib/aws-lambda'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'

interface KdsShardCountMetricsProps {
  dataStream: Stream
  nameSpace: string
  metricName: string
}

export class KdsShardCountMetrics extends Construct {
  constructor(scope: Construct, id: string, props: KdsShardCountMetricsProps) {
    super(scope, id)

    // CloudWatch Custom Metrics定義
    const nameSpace = 'Custom/KinesisMetrics'
    const metricName_ = 'OpenShardCount'

    // Lambda Function
    const lambdaFunc = new nodejsLambda.NodejsFunction(this, 'LambdaFunc', {
      functionName: `${Stack.of(this).stackName}-put-metrics-func`,
      entry: './resources/lambda/kdsShardCount/index.ts',
      handler: 'handler',
      runtime: lambda_.Runtime.NODEJS_18_X,
      architecture: lambda_.Architecture.ARM_64,
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'cloudwatch:PutMetricStream',
            'cloudwatch:PutMetricData',
            'kinesis:DescribeStreamSummary'
          ],
          resources: ['*']
        })
      ],
      environment: {
        NAMESPACE: nameSpace,
        METRIC_NAME: metricName_,
        DATA_STREAM_NAME: props.dataStream.streamName
      }
    })

    // CloudWatch Logs: LogGroup
    new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: `/aws/lambda/${lambdaFunc.functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    // EventBridge Schedule Rule
    new events.Rule(this, 'Rule', {
      schedule: events.Schedule.cron({ minute: '0/1', hour: '*', day: '*' }),
      targets: [new targets.LambdaFunction(lambdaFunc, { retryAttempts: 3 })]
    })
  }
}
