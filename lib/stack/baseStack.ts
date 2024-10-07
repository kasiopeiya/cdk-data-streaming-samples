import { Stack, type StackProps, RemovalPolicy, Tags } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as apigw from 'aws-cdk-lib/aws-apigateway'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Bucket, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3'

import { AlarmNotificationHandler } from '../construct/alarmNotificationHandler'

/**
 * ステートフルなリソースを構築する
 */
export class BaseStack extends Stack {
  public readonly trailBucket: Bucket

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    Tags.of(this).add('StackName', this.stackName)

    /*
    /* S3
    -------------------------------------------------------------------------- */
    // CloudTrailログ出力先S3バケット
    this.trailBucket = new Bucket(this, 'CloudTrailBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      autoDeleteObjects: true
    })

    const bucketAclPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
      actions: ['s3:GetBucketAcl'],
      resources: [this.trailBucket.bucketArn, `${this.trailBucket.bucketArn}/*`]
    })
    const putObjectPolicyStatement = new iam.PolicyStatement({
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
    this.trailBucket.addToResourcePolicy(bucketAclPolicyStatement)
    this.trailBucket.addToResourcePolicy(putObjectPolicyStatement)

    /*
    * CloudWatch Logs
    -------------------------------------------------------------------------- */
    // テストスクリプト用LogGroup: apiGwPutRecord
    new logs.LogGroup(this, 'apiGwPutRecordLog', {
      logGroupName: '/test/script/apiGwPutRecord',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })
    // テストスクリプト用LogGroup: apiGwPutRecords
    new logs.LogGroup(this, 'apiGwPutRecordsLog', {
      logGroupName: '/test/script/apiGwPutRecords',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
    })
    // テストスクリプト用LogGroup: sdkPutRecords
    new logs.LogGroup(this, 'sdkPutRecordsLog', {
      logGroupName: '/test/script/sdkPutRecords',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY
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
  }
}
