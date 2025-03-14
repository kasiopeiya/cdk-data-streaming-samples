import * as path from 'path'

import { Construct } from 'constructs'
import { Duration, RemovalPolicy, Size, Stack } from 'aws-cdk-lib'
import { aws_kinesis as kds } from 'aws-cdk-lib'
import { aws_s3 as s3 } from 'aws-cdk-lib'
import { aws_lambda as lambda } from 'aws-cdk-lib'
import { aws_kinesisfirehose as firehose } from 'aws-cdk-lib'
import { aws_logs as logs } from 'aws-cdk-lib'
import { aws_lambda_nodejs as nodejsLambda } from 'aws-cdk-lib'
import { aws_iam as iam } from 'aws-cdk-lib'
import { aws_cloudwatch as cw } from 'aws-cdk-lib'
import * as kinesisfirehose_alpha from '@aws-cdk/aws-kinesisfirehose-alpha'
import * as kinesisfirehose_destination_alpha from '@aws-cdk/aws-kinesisfirehose-destinations-alpha'

interface FirehoseWithLambdaProps {
  /** KDS Data Stream */
  sourceStream: kds.IStream
  /** Firehoseと連携するLambda関数コードのパス */
  lambdaEntry: string
  /** 配信先S3バケット */
  destinationBucket?: s3.Bucket
  /** バックアップ先S3バケット */
  backupBucket?: s3.Bucket
  /** 配信のバッファリング秒数 */
  bufferingInterval?: Duration
  /** Lambda加工処理のバッファリング設定 */
  processorBufferingInterval?: Duration
}

/**
 * Data FirehoseによるS3配信
 * Lambdaによる動的パーティショニングを使用して、S3 Bucket保存時のprefixを動的に生成
 */
export class FirehoseWithLambda extends Construct {
  public readonly deliveryStream: kinesisfirehose_alpha.DeliveryStream
  public readonly lambdaFunc: lambda.Function

  constructor(scope: Construct, id: string, props: FirehoseWithLambdaProps) {
    super(scope, id)

    // 動的パーティショニング使用時はバッファリング間隔は最低60秒
    props.bufferingInterval ??= Duration.seconds(60)
    props.processorBufferingInterval ??= Duration.seconds(10)

    if (props.bufferingInterval.toSeconds() < 60) {
      throw new Error('bufferingInterval must be at least 60 seconds.')
    }

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
    this.lambdaFunc = new nodejsLambda.NodejsFunction(this, 'LambdaFunc', {
      functionName: `${Stack.of(this).stackName}-func`,
      entry: props.lambdaEntry,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
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
      loggingFormat: lambda.LoggingFormat.JSON,
      systemLogLevelV2: lambda.SystemLogLevel.WARN
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
    * S3
    -------------------------------------------------------------------------- */
    // Firehose配信先バケット
    props.destinationBucket ??= new s3.Bucket(this, 'DestinationBucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true
    })

    // Firehose加工処理時のバックアップ用
    props.backupBucket ??= new s3.Bucket(this, 'FirehoseBkBucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true
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
        bufferInterval: props.processorBufferingInterval,
        bufferSize: Size.mebibytes(3)
      }),
      logGroup: s3DestinationErrorLogGroup,
      s3Backup: {
        bucket: props.backupBucket,
        bufferingInterval: Duration.seconds(60),
        bufferingSize: Size.mebibytes(5),
        logGroup: s3BkErrorLogGroup,
        mode: kinesisfirehose_destination_alpha.BackupMode.ALL // ALLしか設定できない
      }
    })

    // Delivery Stream
    this.deliveryStream = new kinesisfirehose_alpha.DeliveryStream(this, 'SampleDeliveryStream', {
      destinations: [s3Destination],
      sourceStream: props.sourceStream
    })
    const cfnFirehose = this.deliveryStream.node.defaultChild as firehose.CfnDeliveryStream
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
