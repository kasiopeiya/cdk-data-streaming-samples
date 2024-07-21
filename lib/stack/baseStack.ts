import { Stack, type StackProps, RemovalPolicy } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'

/**
 * ステートフルなリソースを構築する
 */
export class BaseStack extends Stack {
  public readonly firehoseBucket: Bucket
  public readonly firehoseBkBucket: Bucket

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    /*
    * S3
    -------------------------------------------------------------------------- */
    this.firehoseBucket = new Bucket(this, 'FirehoseBucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true
    })

    // Firehoseのバックアップ用
    this.firehoseBkBucket = new Bucket(this, 'FirehoseBkBucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true
    })

    this.exportValue(this.firehoseBkBucket.bucketArn)
    this.exportValue(this.firehoseBucket.bucketArn)
  }
}
