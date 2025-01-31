import * as path from 'path'

import { type Construct } from 'constructs'
import { Duration, Stack, type StackProps, RemovalPolicy, Tags } from 'aws-cdk-lib'
import * as kinesisfirehose_alpha from '@aws-cdk/aws-kinesisfirehose-alpha'
import * as kinesisfirehose_destination_alpha from '@aws-cdk/aws-kinesisfirehose-destinations-alpha'
import { aws_lambda as lambda } from 'aws-cdk-lib'
import { aws_logs as logs } from 'aws-cdk-lib'
import { aws_cloudwatch as cw } from 'aws-cdk-lib'
import { aws_cloudwatch_actions as cwAction } from 'aws-cdk-lib'
import { aws_kinesis as kds } from 'aws-cdk-lib'
import { aws_s3 as s3 } from 'aws-cdk-lib'

import { KdsDataStream } from '../construct/kdsDataStream'
import { KdsCWDashboard } from '../construct/kdsCWDashboard'
import { FirehoseWithLambda } from '../construct/firehoseWithLambda'
import { KdsScaleOutLambda } from '../construct/kdsScaleOutLambda'

interface DeliveryS3StackProps extends StackProps {
  /** 配信のバッファリング秒数 0 ~ 900, 動的パーティショニング使用時は 60 ~ 900 */
  bufferingInterval?: Duration
  /** Lambda関数による加工処理有効化フラグ */
  enableLambdaProcessor?: boolean
  /** Lambda加工処理のバッファリング設定 */
  processorBufferingInterval?: Duration
}

/**
 * S3への配信構成
 */
export class DeliveryS3Stack extends Stack {
  constructor(scope: Construct, id: string, props?: DeliveryS3StackProps) {
    super(scope, id, props)

    Tags.of(this).add('StackName', this.stackName)

    props ??= {}
    props.enableLambdaProcessor ??= false
    props.bufferingInterval ??= Duration.seconds(5)

    /*
    * Kinesis Data Streams
    -------------------------------------------------------------------------- */
    const kdsDataStream = new KdsDataStream(this, 'KdsDataStream')

    /*
    * S3
    -------------------------------------------------------------------------- */
    // Firehose配信先バケット
    const destinationBucket = new s3.Bucket(this, 'DestinationBucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true
    })

    // Firehose加工処理時のバックアップ用
    const firehoseBkBucket = new s3.Bucket(this, 'FirehoseBkBucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true
    })

    /*
    * Data Firehose
    -------------------------------------------------------------------------- */
    let deliveryStream: kinesisfirehose_alpha.DeliveryStream
    let lambdaFunc: lambda.Function | undefined
    let firehoseWithLambda: FirehoseWithLambda | undefined

    if (props.enableLambdaProcessor) {
      // Lambda加工処理を実施する場合
      firehoseWithLambda = new FirehoseWithLambda(this, 'FirehoseWithLambda', {
        sourceStream: kdsDataStream.dataStream,
        lambdaEntry: path.join(
          'resources',
          'lambda',
          'firehoseProcessor',
          'dynamicPartitioning',
          'index.ts'
        ),
        destinationBucket,
        backupBucket: firehoseBkBucket,
        bufferingInterval: props.bufferingInterval,
        processorBufferingInterval: props.processorBufferingInterval
      })
      deliveryStream = firehoseWithLambda.deliveryStream
      lambdaFunc = firehoseWithLambda.lambdaFunc
    } else {
      // 配信のみの場合
      const s3Destination = new kinesisfirehose_destination_alpha.S3Bucket(destinationBucket, {
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
        sourceStream: kdsDataStream.dataStream
      })
    }

    /*
    * Monitoring
    -------------------------------------------------------------------------- */
    // Alarm
    const writePrvAlarm: cw.Alarm = kdsDataStream.createWriteProvisionedAlarm()
    const readPrvAlarm: cw.Alarm = kdsDataStream.createReadProvisionedAlarm()
    const iteratorAgeAlarm: cw.Alarm = kdsDataStream.createIteratorAgeAlarm()
    const partitionCountExceededAlarm: cw.Alarm | undefined =
      firehoseWithLambda?.createPartitionCountExceededAlarm()
    const dataFreshnessAlarm: cw.Alarm | undefined = firehoseWithLambda?.createDataFreshnessAlarm()
    const lambdaErrorsAlarm: cw.Alarm | undefined = firehoseWithLambda?.createLambdaErrorsAlarm()
    const cwAlarms: cw.Alarm[] = [
      writePrvAlarm,
      readPrvAlarm,
      iteratorAgeAlarm,
      partitionCountExceededAlarm,
      dataFreshnessAlarm,
      lambdaErrorsAlarm
    ].filter((value) => value !== undefined)

    // Alarm Action
    const cfnStream = kdsDataStream.dataStream.node.defaultChild as kds.CfnStream
    const capacityMode = (cfnStream.streamModeDetails as kds.CfnStream.StreamModeDetailsProperty)
      .streamMode
    if (capacityMode === kds.StreamMode.PROVISIONED) {
      // BUG: cdkのバグで同じLambda関数を複数のAlarm Actionに設定するとエラーになるため、複数のLambdaを用意
      const kdsScaleOutLambda1 = new KdsScaleOutLambda(this, 'KdsScaleOutLambda1', {
        dataStream: kdsDataStream.dataStream
      })
      const kdsScaleOutLambda2 = new KdsScaleOutLambda(this, 'KdsScaleOutLambda2', {
        dataStream: kdsDataStream.dataStream
      })
      writePrvAlarm.addAlarmAction(new cwAction.LambdaAction(kdsScaleOutLambda1.func))
      readPrvAlarm.addAlarmAction(new cwAction.LambdaAction(kdsScaleOutLambda2.func))
    }

    // Dashboard
    new KdsCWDashboard(this, 'KdsCWDashborad', {
      alarms: cwAlarms,
      dataStream: kdsDataStream.dataStream,
      deliveryStream,
      lambdaFunction: lambdaFunc
    })
  }
}
