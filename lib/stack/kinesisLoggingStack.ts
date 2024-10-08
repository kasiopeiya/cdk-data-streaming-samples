import { Stack, type StackProps, Tags } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { Bucket } from 'aws-cdk-lib/aws-s3'

import { TrailDataStream } from '../construct/trailDataStream'
import { CloudTrailLogAnalytics } from '../construct/awsLogAnalytics'

interface KinesisLoggingStackProps extends StackProps {
  trailBucket: Bucket
}

/**
 * Kinesis Data Streamsのデータログ収集と解析の仕組みを構築する
 */
export class KinesisLoggingStack extends Stack {
  constructor(scope: Construct, id: string, props: KinesisLoggingStackProps) {
    super(scope, id, props)

    Tags.of(this).add('StackName', this.stackName)

    /*
    * CloudTrail
    -------------------------------------------------------------------------- */
    // CloudTrailのKinesisデータイベントを取得しS3バケットに保存
    new TrailDataStream(this, 'TrailDataStream', {
      trailBucket: props.trailBucket
    })

    /*
    * Glue, Athena
    -------------------------------------------------------------------------- */
    // GlueとAthenaを使用して、CloudTrailのログを解析する仕組みを構築
    new CloudTrailLogAnalytics(this, 'CloudTrailLogAnalytics', {
      dataBucket: props.trailBucket
    })
  }
}
