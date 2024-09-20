import * as path from 'path'

import { RemovalPolicy, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'

interface TestDataInjectionProps {
  computeType?: codebuild.ComputeType
}

/**
 * Producerスクリプトを実行し、テストデータ投入するためのCodeBuild Projectを構築する
 */
export class TestDataInjection extends Construct {
  constructor(scope: Construct, id: string, props?: TestDataInjectionProps) {
    super(scope, id)

    props ??= {}

    /*
    * S3
    -------------------------------------------------------------------------- */
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      versioned: false,
      enforceSSL: true
    })

    /*
    * CloudWatch Logs
    -------------------------------------------------------------------------- */
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK
    })

    /*
    * CodeBuild
    -------------------------------------------------------------------------- */
    // buildspec
    const buildSpecTemplate = {
      version: 0.2,
      env: {
        shell: 'bash',
        variables: {
          SCRIPT_NAME: 'apiGwPutRecords',
          STACK_NAME: 'dev-data-str-sample-apigw-kds-lambda-stack'
        }
      },
      phases: {
        install: {
          command: ['ls -al', 'npm ci', 'node --version', 'jq --version']
        },
        pre_build: {
          commands: ['ls -al', 'echo "$SCRIPT_NAME"', 'echo "$STACK_NAME"']
        },
        build: {
          commands: ['npx ts-node "$SCRIPT_NAME.ts"']
        },
        post_build: {
          commands: [
            'rm -rf node_modules',
            'echo succeeded > result.txt',
            'cd ./sh',
            'bash ./checkScriptLog.sh "../$SCRIPT_NAME.log" | tee checkScriptLog.sh.log',
            'cat result.txt',
            'bash ./checkCwAlarms.sh "StackName" "$STACK_NAME" | tee checkCwAlarms.sh.log',
            'cat result.txt',
            'if [ $(cat result.txt) == "failed" ]; then exit 1; fi'
          ]
        }
      },
      artifacts: {
        files: ['**/*']
      }
    }

    // Project
    const buildProject = new codebuild.Project(this, 'Project', {
      projectName: `${Stack.of(this).stackName}-project`,
      buildSpec: codebuild.BuildSpec.fromObject(buildSpecTemplate),
      environment: {
        privileged: true,
        buildImage: codebuild.LinuxBuildImage.fromAsset(this, 'MyImage', {
          directory: path.join(__dirname, '..', '..', 'script')
        }),
        computeType: (props.computeType ??= codebuild.ComputeType.SMALL)
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.DOCKER_LAYER),
      artifacts: codebuild.Artifacts.s3({ bucket: artifactBucket }),
      ssmSessionPermissions: true,
      logging: { cloudWatch: { logGroup } }
    })

    /*
    * アクセス許可
    -------------------------------------------------------------------------- */
    // S3
    artifactBucket.grantWrite(buildProject)

    // API GW実行
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:Invoke'],
        resources: [`arn:aws:ssm:${Stack.of(this).region}:${Stack.of(this).account}:parameter*`]
      })
    )
    // Resource Groups読み取り
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['tag:GetResources'],
        resources: ['*']
      })
    )
    // CloudWatch Alarm読み取り
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:DescribeAlarms'],
        resources: ['*']
      })
    )
  }
}
