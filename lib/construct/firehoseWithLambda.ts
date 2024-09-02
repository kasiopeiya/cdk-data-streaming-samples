import * as path from 'path'

import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { type Stream } from 'aws-cdk-lib/aws-kinesis'
import { type Bucket } from 'aws-cdk-lib/aws-s3'
import * as kinesisfirehose_alpha from '@aws-cdk/aws-kinesisfirehose-alpha'
import * as kinesisfirehose_destination_alpha from '@aws-cdk/aws-kinesisfirehose-destinations-alpha'
import * as lambda_ from 'aws-cdk-lib/aws-lambda'
import { type CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as cw from 'aws-cdk-lib/aws-cloudwatch'

interface FirehoseWithLambdaProps {
  /** KDS Data Stream */
  sourceStream: Stream
  /** 配信先S3バケット */
  destinationBucket: Bucket
  /** Firehoseと連携するLambda関数コードのパス */
  lambdaEntry: string
  /** 配信のバッファリング秒数 */
  bufferingInterval?: Duration
  /** Lambda関数加工処理設定 */
  dataProcessorOptions?: kinesisfirehose_alpha.DataProcessorProps
  /** バックアップ配信設定 */
  s3BackupOptions?: {
    bucket: kinesisfirehose_destination_alpha.DestinationS3BackupProps['bucket']
    bufferingInterval?: kinesisfirehose_destination_alpha.DestinationS3BackupProps['bufferingInterval']
    bufferingSize?: kinesisfirehose_destination_alpha.DestinationS3BackupProps['bufferingSize']
  }
}

/**
 * 動的パーティショニングを使ったData FirehoseによるS3配信
 */
export class FirehoseWithLambda extends Construct {
  public readonly deliveryStream: kinesisfirehose_alpha.DeliveryStream
  public readonly lambdaFunc: lambda_.Function

  constructor(scope: Construct, id: string, props: FirehoseWithLambdaProps) {
    super(scope, id)

    // 動的パーティショニング使用時はバッファリング間隔は最低60秒
    props.bufferingInterval ??= Duration.seconds(60)
    if (props.bufferingInterval.toSeconds() < 60) {
      throw new Error('bufferingInterval must be at least 60 seconds.')
    }

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
    this.lambdaFunc = new nodejsLambda.NodejsFunction(this, 'LambdaFunc', {
      functionName: `${Stack.of(this).stackName}-func`,
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
      layers: [customlayer],
      logFormat: lambda_.LogFormat.JSON,
      systemLogLevel: lambda_.SystemLogLevel.WARN
    })

    /*
    * CloudWatch Logs
    -------------------------------------------------------------------------- */
    // Lambda関数
    new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${this.lambdaFunc.functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    // S3配信エラーログ
    const s3DestinationErrorLogGroup = new logs.LogGroup(this, 'S3DestinationErrorLogGroup', {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    // S3バックアップエラーログ
    const s3BkErrorLogGroup = new logs.LogGroup(this, 'S3BackupErrorLogGroup', {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })

    /*
    * Data Firehose
    -------------------------------------------------------------------------- */
    // S3配信設定
    const s3Destination = new kinesisfirehose_destination_alpha.S3Bucket(props.destinationBucket, {
      bufferingInterval: props.bufferingInterval,
      dataOutputPrefix: 'data/!{partitionKeyFromLambda:dataType}/!{timestamp:yyyy/MM/dd/HH}/',
      errorOutputPrefix: 'error/!{firehose:error-output-type}/!{timestamp:yyyy/MM/dd/HH}/',
      processor: new kinesisfirehose_alpha.LambdaFunctionProcessor(this.lambdaFunc, {
        bufferInterval: props.dataProcessorOptions?.bufferInterval,
        bufferSize: props.dataProcessorOptions?.bufferSize
      }),
      logGroup: s3DestinationErrorLogGroup,
      s3Backup: {
        bucket: props.s3BackupOptions?.bucket,
        bufferingInterval: props.s3BackupOptions?.bufferingInterval,
        bufferingSize: props.s3BackupOptions?.bufferingSize,
        logGroup: s3BkErrorLogGroup,
        mode: kinesisfirehose_destination_alpha.BackupMode.ALL // ALLしか設定できない
      }
    })

    // Delivery Stream
    this.deliveryStream = new kinesisfirehose_alpha.DeliveryStream(this, 'SampleDeliveryStream', {
      destinations: [s3Destination],
      sourceStream: props.sourceStream
    })
    const cfnFirehose = this.deliveryStream.node.defaultChild as CfnDeliveryStream
    cfnFirehose.addPropertyOverride(
      'ExtendedS3DestinationConfiguration.DynamicPartitioningConfiguration',
      {
        Enabled: true
      }
    )
    cfnFirehose.addPropertyOverride('ExtendedS3DestinationConfiguration.BufferingHints', {
      IntervalInSeconds: 60,
      SizeInMBs: 64
    })
    cfnFirehose.addPropertyOverride('ExtendedS3DestinationConfiguration.ProcessingConfiguration', {
      Enabled: true,
      processors: [
        {
          Type: 'Lambda',
          Parameters: [
            {
              ParameterName: 'LambdaArn',
              ParameterValue: this.lambdaFunc.functionArn
            }
          ]
        },
        {
          Type: 'AppendDelimiterToRecord', // レコード間に改行を挿入
          Parameters: [
            {
              ParameterName: 'Delimiter',
              ParameterValue: '\\n'
            }
          ]
        }
      ]
    })
  }

  /**
   * FirehoseのMetricを作成
   * L2で作成できないMetricが多いため
   * @param metricName
   * @param statistic
   * @returns
   */
  private createFirehoseMetric(metricName: string, statistic?: string): cw.Metric {
    return new cw.Metric({
      namespace: 'AWS/Firehose',
      metricName,
      dimensionsMap: {
        DeliveryStreamName: this.deliveryStream.deliveryStreamName
      },
      statistic
    })
  }

  /**
   * パーティション数超過のアラームを作成
   * @param metricOption メトリクス設定
   * @param alarmOption  CW Alarm設定
   * @returns
   */
  createPartitionCountExceededAlarm(
    metricOption?: cw.MetricOptions,
    alarmOption?: cw.CreateAlarmOptions
  ): cw.Alarm {
    metricOption ??= {
      period: Duration.minutes(1),
      statistic: cw.Stats.SUM
    }
    alarmOption ??= {
      alarmName: `firehose-partition-count-alarm-${Stack.of(this).stackName}`,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      threshold: 0,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING
    }
    const metric = this.createFirehoseMetric('PartitionCountExceeded')
    return metric.createAlarm(this, 'partitionCountExceededAlarm', alarmOption)
  }

  /**
   * Firehoseレコード経過時間のアラームを作成
   * @param metricOption メトリクス設定
   * @param alarmOption  CW Alarm設定
   * @returns
   */
  createDataFreshnessAlarm(
    metricOption?: cw.MetricOptions,
    alarmOption?: cw.CreateAlarmOptions
  ): cw.Alarm {
    metricOption ??= {
      period: Duration.minutes(1),
      statistic: cw.Stats.percentile(99)
    }
    alarmOption ??= {
      alarmName: `firehose-s3-data-freshness-alarm-${Stack.of(this).stackName}`,
      evaluationPeriods: 5,
      datapointsToAlarm: 5,
      threshold: 0,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING
    }
    const metric = this.createFirehoseMetric('DeliveryToS3.DataFreshness')
    return metric.createAlarm(this, 'dataFreshnessAlarm', alarmOption)
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
      alarmName: `firehose-lambda-errors-alarm-${Stack.of(this).stackName}`,
      evaluationPeriods: 5,
      datapointsToAlarm: 3,
      threshold: 0,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING
    }
    const metric = this.lambdaFunc.metricErrors(metricOption)
    return metric.createAlarm(this, 'lambdaErrorsAlarm', alarmOption)
  }
}
