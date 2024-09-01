import { Stack, type StackProps, RemovalPolicy } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'
import * as s3Deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as apigw from 'aws-cdk-lib/aws-apigateway'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as logs from 'aws-cdk-lib/aws-logs'

import { AlarmNotificationHandler } from '../construct/alarmNotificationHandler'

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

    // テスト資材配置用
    const testResourceBucket = new Bucket(this, 'TestResourceBucket', {
      bucketName: 'cdk-samples-test-resource-bucket',
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true
    })
    // ローカルリソースをS3に配置
    const scriptSource: s3Deploy.ISource = s3Deploy.Source.asset('./script', {
      exclude: ['**/node_modules/**/*', '**/node_modules/.*', '*.log']
    })
    new s3Deploy.BucketDeployment(this, 'TestResourceDeployment', {
      sources: [scriptSource],
      destinationBucket: testResourceBucket,
      prune: true,
      retainOnDelete: false,
      logGroup: new logs.LogGroup(this, 'TestResourceDeploymentLogGroup', {
        removalPolicy: RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_DAY
      })
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
    * 通知
    -------------------------------------------------------------------------- */
    // Alarm通知用SNS Topic
    const alarmTopic = new sns.Topic(this, 'AlarmNotificationTopic')
    alarmTopic.applyRemovalPolicy(RemovalPolicy.DESTROY)

    // CloudWatch Alarmのステータス変更を検知し、件名本文を加工してメール通知
    // Envent Bridge - Input Transformer - StepFunctions - SNS
    new AlarmNotificationHandler(this, 'AlarmNotificationHandler', {
      topic: alarmTopic
    })

    /*
    * 出力設定
    -------------------------------------------------------------------------- */
    this.exportValue(this.firehoseBkBucket.bucketArn)
    this.exportValue(this.firehoseBucket.bucketArn)
  }
}
