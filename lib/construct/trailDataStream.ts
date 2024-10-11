import { Construct } from 'constructs'
import { aws_s3 as s3 } from 'aws-cdk-lib'
import { aws_iam as iam } from 'aws-cdk-lib'
import { aws_cloudtrail as cloudtrail } from 'aws-cdk-lib'

export const LogEvent = {
  READONLY: ['GetRecord', 'GetRecords'],
  WRITEONLY: ['PutRecord', 'PutRecords'],
  READWRITE: ['GetRecord', 'GetRecords', 'PutRecord', 'PutRecords']
} as const

interface TrailDataStreamProps {
  /** CloudTrailのログ保存先S3 Bucket */
  trailBucket: s3.Bucket
  /**
   * 記録するログイベントの種類
   * @default LogEvent.WRITEONLY
   *  */
  logEventType?: (typeof LogEvent)[keyof typeof LogEvent]
}

/**
 * Kinesis Data StreamsのCloudTrailデータイベント証跡を作成する
 */
export class TrailDataStream extends Construct {
  constructor(scope: Construct, id: string, props: TrailDataStreamProps) {
    super(scope, id)

    props.logEventType ??= LogEvent.WRITEONLY

    /*
    * CloudTrail
    -------------------------------------------------------------------------- */
    // IAM Role
    const trailRole = new iam.Role(this, 'trailRole', {
      assumedBy: new iam.ServicePrincipal('cloudtrail.amazonaws.com')
    })
    props.trailBucket.grantWrite(trailRole)

    // Trail
    new cloudtrail.CfnTrail(this, 'Resource', {
      isLogging: true,
      s3BucketName: props.trailBucket.bucketName,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      enableLogFileValidation: true,
      // Kinesisデータイベントを取得するための設定
      advancedEventSelectors: [
        {
          name: 'KinesisDataEvents',
          fieldSelectors: [
            {
              field: 'eventCategory',
              equalTo: ['Data']
            },
            {
              field: 'resources.type',
              equalTo: ['AWS::Kinesis::Stream']
            },
            {
              field: 'eventName',
              equalTo: [...props.logEventType]
            }
          ]
        }
      ]
    })
  }
}
