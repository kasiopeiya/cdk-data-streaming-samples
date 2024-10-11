import { Construct } from 'constructs'
import { RemovalPolicy, Stack } from 'aws-cdk-lib'
import { aws_kinesis as kds } from 'aws-cdk-lib'
import { aws_lambda_nodejs as node } from 'aws-cdk-lib'
import { aws_lambda as lambda } from 'aws-cdk-lib'
import { aws_events as events } from 'aws-cdk-lib'
import { aws_events_targets as targets } from 'aws-cdk-lib'
import { aws_iam as iam } from 'aws-cdk-lib'
import { aws_logs as logs } from 'aws-cdk-lib'

interface KdsShardCountMetricsProps {
  dataStream: kds.Stream
  nameSpace: string
  metricName: string
}

/**
 * アカウント内のオンデマンドモードのKDS DataStreamのシャード数をカスタムメトリクスとして送信する仕組みを構築
 */
export class KdsShardCountMetrics extends Construct {
  constructor(scope: Construct, id: string, props: KdsShardCountMetricsProps) {
    super(scope, id)

    // CloudWatch Custom Metrics定義
    const nameSpace = 'Custom/KinesisMetrics'
    const metricName_ = 'OpenShardCount'

    // Lambda Function
    const lambdaFunc = new node.NodejsFunction(this, 'LambdaFunc', {
      functionName: `${Stack.of(this).stackName}-put-metrics-func`,
      entry: './resources/lambda/kdsShardCount/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
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
