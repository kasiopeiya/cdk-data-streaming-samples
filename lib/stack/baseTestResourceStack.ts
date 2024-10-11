import { Stack, type StackProps, RemovalPolicy, Tags } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { aws_s3 as s3 } from 'aws-cdk-lib'
import { aws_s3_deployment as s3Deploy } from 'aws-cdk-lib'
import { aws_logs as logs } from 'aws-cdk-lib'

import { TestDataInjection } from '../construct/testDataInjection'

/**
 * ステートフルなリソースを構築する
 */
export class BaseTestResourceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    Tags.of(this).add('StackName', this.stackName)

    /*
    * S3
    -------------------------------------------------------------------------- */
    // テスト資材配置用
    const testResourceBucket = new s3.Bucket(this, 'TestResourceBucket', {
      bucketName: `cdk-samples-test-resource-bucket-${this.account}`,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
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
    * CodeBuild
    -------------------------------------------------------------------------- */
    // テストデータ投入用BuildProject
    new TestDataInjection(this, 'TestDataInjection', { testResourceBucket })
  }
}
