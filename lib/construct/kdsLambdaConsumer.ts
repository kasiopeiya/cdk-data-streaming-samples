import * as path from 'path'

import { Construct } from 'constructs'
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as lambda_ from 'aws-cdk-lib/aws-lambda'
import { SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { type Stream } from 'aws-cdk-lib/aws-kinesis'
import * as cw from 'aws-cdk-lib/aws-cloudwatch'

interface KdsLambdaConsumerProps {
  dataStream: Stream
  /** Lambda関数のhandlerモジュールファイルパス */
  lambdaEntry: string
  /** Lambda Event Source Mappiing設定  */
  eventSourceMappingOption?: lambda_.EventSourceMappingOptions
  /** DynamoDBの読み込み書き込みキャパシティ設定 */
  billing?: dynamodb.Billing
}

/**
 * Kinesis Lambda Consumer
 * DynamoDBによる重複排除処理を含む
 */
export class KdsLambdaConsumer extends Construct {
  public readonly kdsConsumerFunction: lambda_.Function
  public readonly logGroup: logs.LogGroup
  public readonly dlq: sqs.Queue

  constructor(scope: Construct, id: string, props: KdsLambdaConsumerProps) {
    super(scope, id)

    props.billing ??= dynamodb.Billing.provisioned({
      readCapacity: dynamodb.Capacity.fixed(3),
      writeCapacity: dynamodb.Capacity.autoscaled({ maxCapacity: 5 })
    })

    /*
    * DynamoDB
    -------------------------------------------------------------------------- */
    const table = new dynamodb.TableV2(this, 'Table', {
      partitionKey: { name: 'recordId', type: dynamodb.AttributeType.STRING },
      billing: props.billing,
      tableClass: dynamodb.TableClass.STANDARD,
      encryption: dynamodb.TableEncryptionV2.dynamoOwnedKey(),
      pointInTimeRecovery: false,
      removalPolicy: RemovalPolicy.DESTROY,
      contributorInsights: true,
      timeToLiveAttribute: 'expired',
      dynamoStream: dynamodb.StreamViewType.NEW_IMAGE,
      tags: [
        { key: 'Name', value: `${Stack.of(this).stackName}-lambda-consumer-deduplication-table` }
      ]
    })

    /*
    * Lambda
    -------------------------------------------------------------------------- */
    // DLQ
    this.dlq = new sqs.Queue(this, 'KinesisDeadLetterQueue')

    // Lambda Layer
    const customlayer = new lambda_.LayerVersion(this, 'CustomLayer', {
      removalPolicy: RemovalPolicy.DESTROY,
      code: lambda_.Code.fromAsset(path.join('resources', 'layer', 'common')),
      compatibleArchitectures: [lambda_.Architecture.X86_64, lambda_.Architecture.ARM_64]
    })

    // Lambda Function
    const funcName = `${Stack.name}-kds-consumer-func`
    this.kdsConsumerFunction = new nodejsLambda.NodejsFunction(this, 'LambdaFunc', {
      functionName: funcName,
      entry: props.lambdaEntry,
      handler: 'handler',
      runtime: lambda_.Runtime.NODEJS_20_X,
      architecture: lambda_.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.minutes(3),
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ['xray:*'],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          actions: ['cloudwatch:PutMetricStream', 'cloudwatch:PutMetricData'],
          resources: ['*']
        })
      ],
      environment: {
        TABLE_NAME: table.tableName,
        FUNCTION_NAME: funcName,
        METRIC_NAME: 'LambdaBatchSize',
        NAMESPACE: 'Custom/LambdaMetrics'
      },
      layers: [customlayer],
      tracing: lambda_.Tracing.ACTIVE,
      loggingFormat: lambda_.LoggingFormat.JSON,
      systemLogLevelV2: lambda_.SystemLogLevel.WARN
    })

    // Event Source Mapping
    props.eventSourceMappingOption ??= {
      enabled: true,
      eventSourceArn: props.dataStream.streamArn,
      bisectBatchOnError: true, // 処理エラー時にバッチを２分割
      batchSize: 300, // 関数あたりの処理レコード数
      maxBatchingWindow: Duration.seconds(3), // バッファリングインターバル
      maxRecordAge: Duration.seconds(500), // レコード期限切れまでの時間
      parallelizationFactor: 1, // シャードあたり起動させる関数の数
      reportBatchItemFailures: true, // エラー処理のレポート
      retryAttempts: 5, // リトライ回数
      startingPosition: lambda_.StartingPosition.TRIM_HORIZON,
      onFailure: new SqsDlq(this.dlq),
      filters: [{ notificationFlag: [true] }]
    }
    const eventSourceMapping = this.kdsConsumerFunction.addEventSourceMapping(
      'EventSourceMapping',
      props.eventSourceMappingOption
    )

    // filter設定
    // L2ではうまく設定されないため、L1のエスケープハッチ利用
    if (props.eventSourceMappingOption.filters !== undefined) {
      // filterのデータ構造をL1のものに変換
      const cfnFilters = props.eventSourceMappingOption.filters.map((value) => {
        return {
          Pattern: JSON.stringify({
            data: value
          })
        }
      })
      const cfnEventSourceMapping = eventSourceMapping.node
        .defaultChild as lambda_.CfnEventSourceMapping
      cfnEventSourceMapping.addPropertyOverride('FilterCriteria', {
        Filters: cfnFilters
      })
    }

    // CloudWatch Logs: LogGroup
    this.logGroup = new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: `/aws/lambda/${this.kdsConsumerFunction.functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    // Lambda関数からDynamoDBヘのアクセスを許可する
    table.grantReadWriteData(this.kdsConsumerFunction)
    props.dataStream.grantRead(this.kdsConsumerFunction)
  }

  /**
   * DLQメッセージ送信のアラームを作成
   * @param metricOption メトリクス設定
   * @param alarmOption  CW Alarm設定
   * @returns
   */
  createDLQMessagesSentAlarm(
    metricOption?: cw.MetricOptions,
    alarmOption?: cw.CreateAlarmOptions
  ): cw.Alarm {
    metricOption ??= {
      period: Duration.minutes(1),
      statistic: cw.Stats.SUM
    }
    alarmOption ??= {
      alarmName: `sqs-dlq-messages-sent-alarm-${Stack.of(this).stackName}`,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      threshold: 0,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING
    }
    const metric = this.dlq.metricNumberOfMessagesSent(metricOption)
    return metric.createAlarm(this, 'dlqMessagesSentAlarm', alarmOption)
  }

  /**
   * Lambda関数エラーのアラームを作成
   * @param metricOption メトリクス設定
   * @param alarmOption  CW Alarm設定
   * @returns
   */
  createLambdaErrorsAlarm(
    metricOption?: cw.MetricOptions,
    alarmOption?: cw.CreateAlarmOptions
  ): cw.Alarm {
    metricOption ??= {
      period: Duration.minutes(1),
      statistic: cw.Stats.SUM
    }
    alarmOption ??= {
      alarmName: `lambda-errors-alarm-${Stack.of(this).stackName}`,
      evaluationPeriods: 5,
      datapointsToAlarm: 3,
      threshold: 0,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING
    }
    const metric = this.kdsConsumerFunction.metricErrors(metricOption)
    return metric.createAlarm(this, 'lambdaErrorsAlarm', alarmOption)
  }
}
