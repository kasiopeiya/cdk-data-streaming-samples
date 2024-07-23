import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { type Stream } from 'aws-cdk-lib/aws-kinesis'
import { type Bucket } from 'aws-cdk-lib/aws-s3'
import * as kinesisfirehose_alpha from '@aws-cdk/aws-kinesisfirehose-alpha'
import * as kinesisfirehose_destination_alpha from '@aws-cdk/aws-kinesisfirehose-destinations-alpha'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { type CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose'
import * as logs from 'aws-cdk-lib/aws-logs'

interface FirehoseWithLambdaProps {
  /** KDS Data Stream */
  sourceStream: Stream
  /** 配信先S3バケット */
  destinationBucket: Bucket
  /** Firehoseと連携するLambda関数コードのパス */
  lambadEntry: string
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
  public readonly lambdaFunc: lambda.Function

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
    this.lambdaFunc = new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(props.lambadEntry)
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
}
