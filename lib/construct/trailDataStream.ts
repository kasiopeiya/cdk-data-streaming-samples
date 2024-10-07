import { Construct } from 'constructs'
import { RemovalPolicy } from 'aws-cdk-lib'
import { Bucket, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail'

/**
 * Kinesis Data StreamsのCloudTrailデータイベント証跡を作成する
 */
export class TrailDataStream extends Construct {
  public readonly trailBucket: Bucket

  constructor(scope: Construct, id: string) {
    super(scope, id)

    /*
    /* S3
    -------------------------------------------------------------------------- */
    // ログ出力先S3バケット
    this.trailBucket = new Bucket(this, 'CloudTrailBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      autoDeleteObjects: true
    })

    // バケットポリシー設定
    const bucketPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
      actions: ['s3:PutObject'],
      resources: [this.trailBucket.bucketArn, `${this.trailBucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          's3:x-amz-acl': 'bucket-owner-full-control'
        }
      }
    })
    this.trailBucket.addToResourcePolicy(bucketPolicyStatement)

    /*
    * CloudTrail
    -------------------------------------------------------------------------- */
    // IAM Role
    const trailRole = new iam.Role(this, 'trailRole', {
      assumedBy: new iam.ServicePrincipal('cloudtrail.amazonaws.com')
    })
    this.trailBucket.grantWrite(trailRole)

    // Trail
    new cloudtrail.CfnTrail(this, 'Resource', {
      isLogging: true,
      s3BucketName: this.trailBucket.bucketName,
      cloudWatchLogsRoleArn: trailRole.roleArn,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
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
            }
          ]
        }
      ]
    })
  }
}
