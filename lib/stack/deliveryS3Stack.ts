import { Duration, Stack, type StackProps, RemovalPolicy } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { type Bucket } from 'aws-cdk-lib/aws-s3'
import * as kinesisfirehose_alpha from '@aws-cdk/aws-kinesisfirehose-alpha'
import * as kinesisfirehose_destination_alpha from '@aws-cdk/aws-kinesisfirehose-destinations-alpha'
import { type Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'

import { KdsDataStream } from '../construct/kdsDataStream'
import { KdsCWDashboard } from '../construct/kdsCWDashboard'
import { FirehoseWithLambda } from '../construct/firehoseWithLambda'

interface DeliveryS3StackProps extends StackProps {
  /** プレフィックス */
  prefix: string
  /** 配信先S3バケット */
  bucket: Bucket
  /** 配信のバッファリング秒数 0 ~ 900, 動的パーティショニング使用時は 60 ~ 900 */
  bufferingInterval?: Duration
  /** Lambda関数による加工オプション */
  lambdaProcessing?: {
    /** Lambda加工有効化フラグ */
    enable: boolean
    /** バックアップ用S3バケット */
    bkBucket: Bucket
    /** Firehoseと連携するLambda関数コードのパス */
    lambdaEntry: string
    /** Lambda関数加工処理のバッファリング秒数 0 ~ 900 */
    processorBufferingInterval?: Duration
  }
}

/**
 * S3への配信構成
 */
export class DeliveryS3Stack extends Stack {
  constructor(scope: Construct, id: string, props: DeliveryS3StackProps) {
    super(scope, id, props)

    /*
    * Kinesis Data Streams
    -------------------------------------------------------------------------- */
    const myDataStream = new KdsDataStream(this, 'DataStream', {
      parameterKeyName: '/firehoseS3/kds/dataStreamName'
    })

    /*
    * Data Firehose
    -------------------------------------------------------------------------- */
    let deliveryStream: kinesisfirehose_alpha.DeliveryStream
    let lambdaFunc: LambdaFunction | undefined

    if (props.lambdaProcessing?.enable === true) {
      // 動的パーティショニング
      if (props.bufferingInterval !== undefined && props.bufferingInterval < Duration.seconds(60)) {
        // 動的パーティショニング使用時は最小値が60秒のため
        props.bufferingInterval = Duration.seconds(60)
      }
      props.lambdaProcessing.processorBufferingInterval ??= Duration.seconds(5)
      const myFirehoseWithLambda = new FirehoseWithLambda(this, 'FirehoseWithLambda', {
        sourceStream: myDataStream.dataStream,
        destinationBucket: props.bucket,
        backupBucket: props.lambdaProcessing.bkBucket,
        lambadEntry: props.lambdaProcessing.lambdaEntry,
        bufferingInterval: props.bufferingInterval,
        processorBufferingInterval: props.lambdaProcessing.processorBufferingInterval
      })
      deliveryStream = myFirehoseWithLambda.deliveryStream
      lambdaFunc = myFirehoseWithLambda.lambdaFunc
    } else {
      // 配信のみ
      props.bufferingInterval ??= Duration.seconds(5)

      const s3Destination = new kinesisfirehose_destination_alpha.S3Bucket(props.bucket, {
        bufferingInterval: props.bufferingInterval,
        dataOutputPrefix: 'data/!{timestamp:yyyy/MM/dd/HH}/',
        errorOutputPrefix: 'error/!{firehose:error-output-type}/!{timestamp:yyyy/MM/dd/HH}/',
        logGroup: new logs.LogGroup(this, 'S3DestinationErrorLogGroup', {
          removalPolicy: RemovalPolicy.DESTROY,
          retention: logs.RetentionDays.ONE_DAY
        })
      })
      deliveryStream = new kinesisfirehose_alpha.DeliveryStream(this, 'SampleDeliveryStream', {
        destinations: [s3Destination],
        sourceStream: myDataStream.dataStream
      })
    }

    /*
    * Monitoring
    -------------------------------------------------------------------------- */
    new KdsCWDashboard(this, 'KdsCWDashborad', {
      prefix: props.prefix,
      dataStream: myDataStream.dataStream,
      deliveryStream,
      lambdaFunction: lambdaFunc
    })
  }
}
