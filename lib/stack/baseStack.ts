import { Stack, type StackProps, RemovalPolicy } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as apigw from 'aws-cdk-lib/aws-apigateway'

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

    /*
    * APIGW
    -------------------------------------------------------------------------- */
    // アカウント設定, CloudWatch Logsへの出力権限
    // アカウント初期構築時に１回だけ実施する必要あり
    const role = new iam.Role(this, 'ApiGWAccountRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonAPIGatewayPushToCloudWatchLogs'
        )
      ]
    })
    new apigw.CfnAccount(this, 'CfnAccount', { cloudWatchRoleArn: role.roleArn })

    /*
    * 出力設定
    -------------------------------------------------------------------------- */
    this.exportValue(this.firehoseBkBucket.bucketArn)
    this.exportValue(this.firehoseBucket.bucketArn)
  }
}
