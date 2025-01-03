import { Duration, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { aws_cloudwatch as cw } from 'aws-cdk-lib'
import { aws_kinesis as kds } from 'aws-cdk-lib'
import { aws_lambda as lambda } from 'aws-cdk-lib'
import { aws_apigateway as apigw } from 'aws-cdk-lib'
import { aws_sqs as sqs } from 'aws-cdk-lib'
import { type DeliveryStream } from '@aws-cdk/aws-kinesisfirehose-alpha'

import { KdsShardCountMetrics } from './kdsShardCountMetrics'
import { alarmDescriptionTable } from '../../resources/dashboard/markdown'

/** Dashboardの各セクション共通Widget */
interface CommonWidgets {
  titleWid: cw.TextWidget
}

/** Alarmセクションで利用可能なWidget */
interface AlarmWidgets extends CommonWidgets {
  alarmStatusWid: cw.AlarmStatusWidget
  tableWid: cw.TextWidget
}

/** API Gatewayセクションで利用可能なWidget */
interface ApiGwSectionWidgets extends CommonWidgets {
  requestCountWid: cw.GraphWidget
  latencyWid: cw.GraphWidget
  errorCountWid: cw.GraphWidget
}

/** KDSセクションで利用可能なWidget */
interface KdsSectionWidgets extends CommonWidgets {
  putRecordsFailedRecordsWid: cw.GraphWidget
  shardCountWid: cw.GraphWidget
  writeProvisionedThroughputExceededBytedsWid: cw.GraphWidget
  writeProvisionedThroughputExceededRecordsWid: cw.GraphWidget
  readProvisionedThroughputExceededWid: cw.GraphWidget
  iteratorAgeMillisecondsWid: cw.GraphWidget
  putRecordsLatencyWid: cw.GraphWidget
  getRecordsLatencyWid: cw.GraphWidget
}

/** Lambdaセクションで利用可能なWidget */
interface LambdaSectionWidgets extends CommonWidgets {
  invocationsWid: cw.GraphWidget
  durationWid: cw.GraphWidget
  concurrentExecutionWid: cw.GraphWidget
  memoryUtilizationWid: cw.GraphWidget
  errorsWid: cw.GraphWidget
  throttlesWid: cw.GraphWidget
  batchSizeWid: cw.GraphWidget
  dlqWid?: cw.GraphWidget
}

/** ログセクションで利用可能なWidget */
interface LogsSectionWidgets extends CommonWidgets {
  producerLogDescriptionWid: cw.TextWidget
  consumerLogDescriptionWid: cw.TextWidget
}

/** Firehoseセクションで利用可能なWidget */
interface FirehoseSectionWidgets extends CommonWidgets {
  dataReadFromKinesisStreamRecordsWid: cw.GraphWidget
  dataReadFromKinesisStreamBytesWid: cw.GraphWidget
  deliveryToS3SuccessWid: cw.GraphWidget
  deliveryToS3RecordsWid: cw.GraphWidget
  deliveryToS3DataFreshnessWid: cw.GraphWidget
  succeedProcessingRecords: cw.GraphWidget
  executeProcessingSuccess: cw.GraphWidget
  partitionCount: cw.GraphWidget
}

/** カスタムメトリクスのキー項目 */
interface CustomMetricsKeys {
  nameSpace: string
  metricName: string
}

/** Producer ScriptのCloudWatch Logs LogGroup名 */
interface ScriptLogGroupNames {
  apiGwPutRecord: string
  apiGwPutRecords: string
  sdkPutRecords: string
}

interface KdsCWDashboardProps {
  /** API GW RestAPI */
  restApi?: apigw.RestApi
  /** KDS DataStream */
  dataStream?: kds.Stream
  /** Lambda Function */
  lambdaFunction?: lambda.Function
  /** Lambda DLQ */
  lambdaDlq?: sqs.Queue
  /** Data Firehose */
  deliveryStream?: DeliveryStream
  /** CloudWatch Alarms */
  alarms?: cw.Alarm[]
  /** Logs Insightの設定 */
  logsInsightOption?: {
    logGroupNames?: ScriptLogGroupNames
  }
}

/**
 * Kinesis Data Streamsとその関連サービスのためのCloudWatch Dashboard
 */
export class KdsCWDashboard extends Construct {
  private readonly defaultHeight: number = 8
  private readonly defaultWidth: number = 12
  private readonly alarms: cw.Alarm[]
  private readonly restApi: apigw.RestApi
  private readonly dataStream: kds.Stream
  private readonly lambdaFunction: lambda.Function
  private readonly lambdaDlq: sqs.Queue
  private readonly deliveryStream: DeliveryStream
  private readonly alarmWidgets: AlarmWidgets
  private readonly apiGwWidgets: ApiGwSectionWidgets
  private readonly kdsWidgets: KdsSectionWidgets
  private readonly lambdaWidgets: LambdaSectionWidgets
  private readonly firehoseWidgets: FirehoseSectionWidgets
  private readonly logsWidgets: LogsSectionWidgets
  private readonly shardCountMetricsKeys: CustomMetricsKeys
  private readonly batchSizeMetricsKeys: CustomMetricsKeys
  private readonly logGroupNames: ScriptLogGroupNames

  constructor(scope: Construct, id: string, props: KdsCWDashboardProps) {
    super(scope, id)

    this.shardCountMetricsKeys = {
      nameSpace: 'Custom/KinesisMetrics',
      metricName: 'OpenShardCount'
    }
    this.batchSizeMetricsKeys = {
      nameSpace: 'Custom/LambdaMetrics',
      metricName: 'LambdaBatchSize'
    }

    props.logsInsightOption ??= {}
    props.logsInsightOption.logGroupNames ??= {
      apiGwPutRecord: '/test/script/apiGwPutRecord',
      apiGwPutRecords: '/test/script/apiGwPutRecords',
      sdkPutRecords: '/test/script/sdkPutRecords'
    }
    this.logGroupNames = props.logsInsightOption.logGroupNames

    /*
    * CloudWatch Dashboard
    -------------------------------------------------------------------------- */
    const dashboard = new cw.Dashboard(this, 'Dashboard', {
      defaultInterval: Duration.hours(1),
      dashboardName: `${Stack.of(this).stackName}-dashboard-${Stack.of(this).region}`
    })

    // Alarms
    if (props.alarms !== undefined) {
      this.alarms = props.alarms
      this.alarmWidgets = this.createAlarmWidgets()
      dashboard.addWidgets(this.alarmWidgets.titleWid)
      dashboard.addWidgets(this.alarmWidgets.alarmStatusWid)
      dashboard.addWidgets(this.alarmWidgets.tableWid)
    }

    // API Gateway
    if (props.restApi !== undefined) {
      this.restApi = props.restApi
      this.apiGwWidgets = this.createApiGwWidgets()
      dashboard.addWidgets(this.apiGwWidgets.titleWid)
      dashboard.addWidgets(this.apiGwWidgets.errorCountWid, this.apiGwWidgets.latencyWid)
    }

    // KDS
    if (props.dataStream !== undefined) {
      this.dataStream = props.dataStream
      this.kdsWidgets = this.createKdsWidgets()
      dashboard.addWidgets(this.kdsWidgets.titleWid)
      dashboard.addWidgets(
        this.kdsWidgets.writeProvisionedThroughputExceededBytedsWid,
        this.kdsWidgets.readProvisionedThroughputExceededWid
      )
      dashboard.addWidgets(
        this.kdsWidgets.writeProvisionedThroughputExceededRecordsWid,
        this.kdsWidgets.readProvisionedThroughputExceededWid
      )
      dashboard.addWidgets(
        this.kdsWidgets.writeProvisionedThroughputExceededRecordsWid,
        this.kdsWidgets.iteratorAgeMillisecondsWid
      )

      const cfnStream = this.dataStream.node.defaultChild as kds.CfnStream
      const capacityMode = (cfnStream.streamModeDetails as kds.CfnStream.StreamModeDetailsProperty)
        .streamMode
      if (capacityMode === 'ON_DEMAND') {
        new KdsShardCountMetrics(this, 'KdsShardCountMetrics', {
          dataStream: this.dataStream,
          nameSpace: this.shardCountMetricsKeys.nameSpace,
          metricName: this.shardCountMetricsKeys.metricName
        })
      }
    }

    // Lambda
    if (props.lambdaFunction !== undefined) {
      if (props.lambdaDlq !== undefined) this.lambdaDlq = props.lambdaDlq
      this.lambdaFunction = props.lambdaFunction
      this.lambdaWidgets = this.createLambdaWidgets()
      dashboard.addWidgets(this.lambdaWidgets.titleWid)
      dashboard.addWidgets(this.lambdaWidgets.invocationsWid, this.lambdaWidgets.durationWid)
      dashboard.addWidgets(
        this.lambdaWidgets.concurrentExecutionWid,
        this.lambdaWidgets.memoryUtilizationWid
      )
      dashboard.addWidgets(this.lambdaWidgets.throttlesWid, this.lambdaWidgets.errorsWid)
      dashboard.addWidgets(this.lambdaWidgets.batchSizeWid)
      if (this.lambdaWidgets.dlqWid !== undefined) dashboard.addWidgets(this.lambdaWidgets.dlqWid)
    }

    // Logs
    if (props.restApi !== undefined && props.lambdaFunction !== undefined) {
      this.logsWidgets = this.createLogsWidgets()
      dashboard.addWidgets(this.logsWidgets.titleWid)
      dashboard.addWidgets(
        this.logsWidgets.producerLogDescriptionWid,
        this.logsWidgets.consumerLogDescriptionWid
      )
    }

    // Data Firehose
    if (props.deliveryStream !== undefined) {
      this.deliveryStream = props.deliveryStream
      this.firehoseWidgets = this.createFirehoseWidgets()
      dashboard.addWidgets(this.firehoseWidgets.titleWid)
      dashboard.addWidgets(
        this.firehoseWidgets.dataReadFromKinesisStreamRecordsWid,
        this.firehoseWidgets.dataReadFromKinesisStreamBytesWid
      )
      dashboard.addWidgets(
        this.firehoseWidgets.deliveryToS3RecordsWid,
        this.firehoseWidgets.deliveryToS3SuccessWid
      )
      dashboard.addWidgets(this.firehoseWidgets.deliveryToS3DataFreshnessWid)
      if (props.lambdaFunction !== undefined) {
        dashboard.addWidgets(
          new cw.TextWidget({
            markdown: '## 動的パーティショニング',
            height: 1,
            width: 24
          })
        )
        dashboard.addWidgets(
          this.firehoseWidgets.succeedProcessingRecords,
          this.firehoseWidgets.executeProcessingSuccess
        )
        dashboard.addWidgets(this.firehoseWidgets.partitionCount)
      }
    }
  }

  /**
   * CW AlarmのWidgetsを作成する
   * @returns
   */
  createAlarmWidgets(): AlarmWidgets {
    // Title
    const titleWid = new cw.TextWidget({
      markdown: '# CloudWatch Alarm',
      height: 2,
      width: 24
    })

    const alarmStatusWid = new cw.AlarmStatusWidget({
      alarms: this.alarms,
      width: 24
    })

    const tableWid = new cw.TextWidget({
      markdown: alarmDescriptionTable,
      height: 15,
      width: 24
    })

    return { titleWid, alarmStatusWid, tableWid }
  }

  /**
   * API GWのWidgetsを作成する
   * @returns
   */
  createApiGwWidgets(): ApiGwSectionWidgets {
    // Title
    const titleWid = new cw.TextWidget({
      markdown: `# API Gateway Metrics
## エラー情報ドキュメント
- [API Gateway default error responses](https://docs.aws.amazon.com/ja_jp/apigateway/latest/developerguide/supported-gateway-response-types.html)
- [KDS PutRecords API Errors](https://docs.aws.amazon.com/kinesis/latest/APIReference/API_PutRecords.html#API_PutRecords_Errors)
- [KDS PutRecord API Errors](https://docs.aws.amazon.com/kinesis/latest/APIReference/API_PutRecord.html#API_PutRecord_Errors)
`,
      height: 4,
      width: 24
    })

    const requestCountWid = new cw.GraphWidget({
      title: 'リクエスト数(Sum)',
      left: [this.restApi.metricCount()],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const latencyWid = new cw.GraphWidget({
      title: 'レイテンシー(Max, p99, Avg, Min)',
      left: [
        this.restApi.metricLatency({ statistic: cw.Stats.MAXIMUM }),
        this.restApi.metricLatency({ statistic: cw.Stats.percentile(99) }),
        this.restApi.metricLatency({ statistic: cw.Stats.AVERAGE }),
        this.restApi.metricLatency({ statistic: cw.Stats.MINIMUM })
      ],
      width: this.defaultWidth,
      height: this.defaultHeight,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const errorCountWid = new cw.GraphWidget({
      title: 'エラー発生数 4×× 5××(Sum)',
      left: [this.restApi.metricClientError()],
      right: [this.restApi.metricServerError()],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    return {
      titleWid,
      requestCountWid,
      latencyWid,
      errorCountWid
    }
  }

  /**
   * KDSのWidgetsを作成する
   * @returns
   */
  createKdsWidgets(): KdsSectionWidgets {
    // Title
    const titleWid = new cw.TextWidget({
      markdown: '# Kinesis Metrics',
      height: 2,
      width: 24
    })

    const putRecordsFailedRecordsWid = new cw.GraphWidget({
      title: 'Kinesis内部エラー発生数(Sum)',
      left: [this.dataStream.metricPutRecordsFailedRecords()],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const incommingBytesPerMinMetrics = new cw.MathExpression({
      label: 'incommingBytes',
      expression: 'e1/60',
      usingMetrics: {
        e1: this.dataStream.metricIncomingBytes({
          statistic: cw.Stats.SUM,
          period: Duration.minutes(1)
        })
      }
    })
    const incommingRecordsPerMinMetrics = new cw.MathExpression({
      label: 'incommingRecords',
      expression: 'e1/60',
      usingMetrics: {
        e1: this.dataStream.metricIncomingRecords({
          statistic: cw.Stats.SUM,
          period: Duration.minutes(1)
        })
      }
    })

    const shardCountWid = new cw.GraphWidget({
      title: 'シャード数(Max)と送信レコード数(Sum)',
      left: [
        new cw.Metric({
          namespace: this.shardCountMetricsKeys.nameSpace,
          metricName: this.shardCountMetricsKeys.metricName,
          dimensionsMap: {
            dataStreamName: this.dataStream.streamName
          }
        })
      ],
      right: [incommingRecordsPerMinMetrics],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.MAXIMUM,
      leftYAxis: { min: 0 },
      rightYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const writeProvisionedThroughputExceededBytedsWid = new cw.GraphWidget({
      title: '書き込み制限エラー数(Sum)と分あたり送信レコードByte(Sum)',
      left: [
        this.dataStream.metricPutRecordsThrottledRecords({
          statistic: cw.Stats.SUM,
          period: Duration.minutes(1)
        })
      ],
      right: [incommingBytesPerMinMetrics],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      rightYAxis: { min: 0 },
      period: Duration.minutes(1)
    })
    const writeProvisionedThroughputExceededRecordsWid = new cw.GraphWidget({
      title: '書き込み制限エラー数(Sum)と分あたり送信レコード数(Sum)',
      left: [
        this.dataStream.metricPutRecordsThrottledRecords({
          statistic: cw.Stats.SUM,
          period: Duration.minutes(1)
        })
      ],
      right: [incommingRecordsPerMinMetrics],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      rightYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const readProvisionedThroughputExceededWid = new cw.GraphWidget({
      title: '読み込み制限エラー数(Sum)',
      left: [this.dataStream.metricPutRecordsThrottledRecords()],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const iteratorAgeMillisecondsWid = new cw.GraphWidget({
      title: 'データストリーム内での待機時間(Max, p99, Avg, Min)',
      left: [
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({ statistic: cw.Stats.MAXIMUM }),
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({
          statistic: cw.Stats.percentile(99)
        }),
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({ statistic: cw.Stats.AVERAGE }),
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({ statistic: cw.Stats.MINIMUM })
      ],
      width: this.defaultWidth,
      height: this.defaultHeight,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const putRecordsLatencyWid = new cw.GraphWidget({
      title: 'PutRecordsLatency(Max, p99, Avg, Min)',
      left: [
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({ statistic: cw.Stats.MAXIMUM }),
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({
          statistic: cw.Stats.percentile(99)
        }),
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({ statistic: cw.Stats.AVERAGE }),
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({ statistic: cw.Stats.MINIMUM })
      ],
      width: this.defaultWidth,
      height: this.defaultHeight,
      leftYAxis: { min: 0 }
    })

    const getRecordsLatencyWid = new cw.GraphWidget({
      title: 'GetRecordsLatency(Max, p99, Avg, Min)',
      left: [
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({ statistic: cw.Stats.MAXIMUM }),
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({
          statistic: cw.Stats.percentile(99)
        }),
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({ statistic: cw.Stats.AVERAGE }),
        this.dataStream.metricGetRecordsIteratorAgeMilliseconds({ statistic: cw.Stats.MINIMUM })
      ],
      width: this.defaultWidth,
      height: this.defaultHeight,
      leftYAxis: { min: 0 }
    })

    return {
      titleWid,
      putRecordsFailedRecordsWid,
      shardCountWid,
      writeProvisionedThroughputExceededBytedsWid,
      writeProvisionedThroughputExceededRecordsWid,
      readProvisionedThroughputExceededWid,
      iteratorAgeMillisecondsWid,
      putRecordsLatencyWid,
      getRecordsLatencyWid
    }
  }

  /**
   * LambdaのWidgetsを作成する
   * @returns
   */
  createLambdaWidgets(): LambdaSectionWidgets {
    // Title
    const titleWid = new cw.TextWidget({
      markdown: '# Lambda Metrics',
      height: 2,
      width: 24
    })

    const invocationsWid = new cw.GraphWidget({
      title: '関数起動数(Sum)',
      left: [this.lambdaFunction.metricInvocations()],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const durationWid = new cw.GraphWidget({
      title: '関数実行時間(Max, p99, Avg, Min)',
      left: [
        this.lambdaFunction.metricDuration({ statistic: cw.Stats.MAXIMUM }),
        this.lambdaFunction.metricDuration({ statistic: cw.Stats.percentile(99) }),
        this.lambdaFunction.metricDuration({ statistic: cw.Stats.AVERAGE }),
        this.lambdaFunction.metricDuration({ statistic: cw.Stats.MINIMUM })
      ],
      width: this.defaultWidth,
      height: this.defaultHeight,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const concurrentExecutionWid = new cw.GraphWidget({
      title: '関数同時実行数(Max)',
      left: [
        new cw.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'ConcurrentExecutions',
          dimensionsMap: {
            FunctionName: this.lambdaFunction.functionName
          }
        })
      ],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.MAXIMUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const memoryUtilizationWid = new cw.GraphWidget({
      title: 'メモリ使用率(Max)',
      left: [
        new cw.Metric({
          namespace: 'LambdaInsights',
          metricName: 'memory_utilization',
          dimensionsMap: {
            function_name: this.lambdaFunction.functionName
          },
          statistic: cw.Stats.MAXIMUM
        })
      ],
      width: this.defaultWidth,
      height: this.defaultHeight,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const errorsWid = new cw.GraphWidget({
      title: 'エラー数(Sum)',
      left: [this.lambdaFunction.metricErrors()],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const throttlesWid = new cw.GraphWidget({
      title: 'スロットリング発生数(Sum)',
      left: [this.lambdaFunction.metricErrors()],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const createCustomMetrics = (statistic: string): cw.Metric => {
      return new cw.Metric({
        namespace: this.batchSizeMetricsKeys.nameSpace,
        metricName: this.batchSizeMetricsKeys.metricName,
        dimensionsMap: {
          functionName: this.lambdaFunction.functionName
        },
        statistic
      })
    }
    const batchSizeWid = new cw.GraphWidget({
      title: 'バッチサイズ：関数あたりの処理レコード数(Max, Avg, Min)',
      left: [
        createCustomMetrics(cw.Stats.MAXIMUM),
        createCustomMetrics(cw.Stats.AVERAGE),
        createCustomMetrics(cw.Stats.MINIMUM)
      ],
      width: this.defaultWidth,
      height: this.defaultHeight,
      leftYAxis: { min: 0 },
      rightYAxis: { min: 0 }
    })

    // DLQ
    let dlqWid: cw.GraphWidget | undefined
    if (this.lambdaDlq !== undefined) {
      dlqWid = new cw.GraphWidget({
        title: 'DLQ送信メッセージ数(Sum)',
        left: [this.lambdaDlq.metricNumberOfMessagesSent()],
        width: this.defaultWidth,
        height: this.defaultHeight,
        statistic: cw.Stats.SUM,
        leftYAxis: { min: 0 },
        period: Duration.minutes(1)
      })
    }

    return {
      titleWid,
      invocationsWid,
      durationWid,
      concurrentExecutionWid,
      memoryUtilizationWid,
      errorsWid,
      throttlesWid,
      batchSizeWid,
      dlqWid
    }
  }

  /**
   * Producer, Consumerのコード実行時に出力されたログのWidgetsを作成する
   * @returns
   */
  createLogsWidgets(): LogsSectionWidgets {
    // Title
    const titleWid = new cw.TextWidget({
      markdown: '# Logs',
      height: 1,
      width: 24
    })

    // Producer Log
    const region = Stack.of(this).region
    const producerLogDescriptionWid = new cw.TextWidget({
      markdown: `# Producer
### Producerスクリプトのログ情報
- Success_Requests: 送信成功したリクエスト数, 「Success_Requests * レコード数(/request) = Success_Records」なら欠損レコードなし
- Retried_Requests: リトライしたリクエスト数
- Failed_Requests: 送信できなかったリクエスト数, １つでもあれば欠損あり

### Logs Insight Queryサンプル
#### カウント
\`\`\`
fields @message |
parse @message "SUCCESS" as @Success |
parse @message "RETRY" as @Retry |
parse @message "FAILED" as @Failed |
stats count(@Success) as Success_Requests, count(@Retry) as Retried_Requests, count(@Failed) as Failed_Requests
\`\`\`
#### エラーログ詳細確認
\`\`\`
fields @message |
parse @message like "Request failed with status code"
\`\`\`

### LogGroup
[${this.logGroupNames.apiGwPutRecord}](https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${this.logGroupNames.apiGwPutRecord.replaceAll('/', '$252F')})
[${this.logGroupNames.apiGwPutRecords}](https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${this.logGroupNames.apiGwPutRecords.replaceAll('/', '$252F')})
[${this.logGroupNames.sdkPutRecords}](https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${this.logGroupNames.sdkPutRecords.replaceAll('/', '$252F')})
        `,
      height: 12,
      width: 12
    })

    // Consumer Log
    const consumerLogDescriptionWid = new cw.TextWidget({
      markdown: `# Consumer
### Lambda関数ログ情報
- Success_Records: 処理が正常に完了したレコード数
- Retried_Records: DynamoDBのPK重複エラー数
- Failed_Records: レコード重複以外のエラー数(DynamoDBのスロットリングなど), リトライ対象

### Logs Insight Queryサンプル
#### カウント
\`\`\`
fields @message |
parse @message "SUCCESS" as @Success |
parse @message "RETRY" as @Retry |
parse @message "FAILED" as @Failed |
stats count(@Success) as Success_Records, count(@Retry) as Retried_Records, count(@Failed) as Failed_Records
\`\`\`
#### エラーログ詳細確認
\`\`\`
fields @message |
parse @message like "FAILED"
\`\`\`

### LogGroup
[${this.lambdaFunction.logGroup.logGroupName}](https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${this.logGroupNames.apiGwPutRecord.replaceAll('/', '$252F')})
        `,
      height: 12,
      width: 12
    })

    return {
      titleWid,
      producerLogDescriptionWid,
      consumerLogDescriptionWid
    }
  }

  /**
   * FirehoseのWidgetsを作成する
   * @returns
   */
  createFirehoseWidgets(): FirehoseSectionWidgets {
    // Title
    const titleWid = new cw.TextWidget({
      markdown: '# Data Firehose Metrics',
      height: 2,
      width: 24
    })

    // FirehoseのMetricを作成する関数
    const createFirehoseMetric = (metricName: string, statistic?: string): cw.Metric => {
      return new cw.Metric({
        namespace: 'AWS/Firehose',
        metricName,
        dimensionsMap: {
          DeliveryStreamName: this.deliveryStream.deliveryStreamName
        },
        statistic
      })
    }

    const dataReadFromKinesisStreamRecordsWid = new cw.GraphWidget({
      title: 'KDSからの読み込みレコード数(Sum)',
      left: [createFirehoseMetric('DataReadFromKinesisStream.Records')],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const dataReadFromKinesisStreamBytesWid = new cw.GraphWidget({
      title: 'KDSからの読み込みバイト数(Sum)',
      left: [createFirehoseMetric('DataReadFromKinesisStream.Bytes')],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const deliveryToS3RecordsWid = new cw.GraphWidget({
      title: 'S3への配信レコード数(Sum)',
      left: [createFirehoseMetric('DeliveryToS3.Records')],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const deliveryToS3SuccessWid = new cw.GraphWidget({
      title: '正常に終了したS3 putコマンド合計(Sum)',
      left: [createFirehoseMetric('DeliveryToS3.Success')],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const deliveryToS3DataFreshnessWid = new cw.GraphWidget({
      title: 'Firehose内の最も古いレコードの経過時間(Max, p99, Avg, Min)',
      left: [
        createFirehoseMetric('DeliveryToS3.DataFreshness', cw.Stats.MAXIMUM),
        createFirehoseMetric('DeliveryToS3.DataFreshness', cw.Stats.percentile(99)),
        createFirehoseMetric('DeliveryToS3.DataFreshness', cw.Stats.AVERAGE),
        createFirehoseMetric('DeliveryToS3.DataFreshness', cw.Stats.MINIMUM)
      ],
      width: this.defaultWidth,
      height: this.defaultHeight,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const succeedProcessingRecords = new cw.GraphWidget({
      title: 'Lambdaによる加工処理が正常に完了したレコード数(Sum)',
      left: [createFirehoseMetric('SucceedProcessing.Records')],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const executeProcessingSuccess = new cw.GraphWidget({
      title: '正常に完了したLambdaによる加工処理数(Sum)',
      left: [createFirehoseMetric('ExecuteProcessing.Success')],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.SUM,
      leftYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    const partitionCount = new cw.GraphWidget({
      title: '動的パーティショニングによるパーティション数と上限超過数(Max)',
      left: [createFirehoseMetric('PartitionCount')],
      right: [createFirehoseMetric('PartitionCountExceeded')],
      width: this.defaultWidth,
      height: this.defaultHeight,
      statistic: cw.Stats.MAXIMUM,
      leftYAxis: { min: 0 },
      rightYAxis: { min: 0 },
      period: Duration.minutes(1)
    })

    return {
      titleWid,
      dataReadFromKinesisStreamRecordsWid,
      dataReadFromKinesisStreamBytesWid,
      deliveryToS3RecordsWid,
      deliveryToS3SuccessWid,
      deliveryToS3DataFreshnessWid,
      succeedProcessingRecords,
      executeProcessingSuccess,
      partitionCount
    }
  }
}
