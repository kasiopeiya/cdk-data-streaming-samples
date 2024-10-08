import { type Stack, Stage, type Environment, Duration } from 'aws-cdk-lib'
import { type Construct } from 'constructs'

import { type Config } from '../../config'
import { BaseStack } from '../stack/baseStack'
import { BaseTestResourceStack } from '../stack/baseTestResourceStack'
import { DeliveryS3Stack } from '../stack/deliveryS3Stack'
import { ApiGwKdsLambdaStack } from '../stack/apiGwKdsLambdaStack'
import { SampleVpcStack } from '../stack/sampleVpcStack'
import { KinesisLoggingStack } from '../stack/kinesisLoggingStack'

export abstract class StageBase extends Stage {
  createCommonStacks(scope: Construct, config: Config, env: Environment): Record<string, Stack> {
    const prefix: string = config.prefix

    /*
    * 共通リソース用スタック
    -------------------------------------------------------------------------- */
    const baseStack = new BaseStack(scope, `${prefix}-base-stack`, { env })

    /*
    * 共通リソース用スタック
    -------------------------------------------------------------------------- */
    const baseTestResourceStack = new BaseTestResourceStack(
      scope,
      `${prefix}-base-test-resource-stack`,
      { env }
    )

    /*
    * Kinesisデータイベントログ出力設定スタック
    -------------------------------------------------------------------------- */
    const kinesisLoggingStack = new KinesisLoggingStack(this, `${prefix}-kinesis-logging-stack`, {
      trailBucket: baseStack.trailBucket
    })

    /*
    * VPCスタック
    -------------------------------------------------------------------------- */
    const baseVpcStack = new SampleVpcStack(scope, `${prefix}-base-vpc-stack`, { env })

    /*
    * S3配信構成用スタック
    -------------------------------------------------------------------------- */
    const deliveryS3Stack = new DeliveryS3Stack(scope, `${prefix}-sample-delivery-s3-stack`, {
      env,
      enableLambdaProcessor: true,
      bufferingInterval: Duration.seconds(60)
    })
    deliveryS3Stack.addDependency(baseStack)

    /*
    * APIGW - KDS - Lambda構成スタック
    -------------------------------------------------------------------------- */
    const apiGwKdsLambdaStack = new ApiGwKdsLambdaStack(
      this,
      `${prefix}-sample-apigw-kds-lambda-stack`,
      {
        env,
        prefix: config.prefix
      }
    )
    apiGwKdsLambdaStack.addDependency(baseStack)

    return {
      baseStack,
      baseTestResourceStack,
      kinesisLoggingStack,
      baseVpcStack,
      deliveryS3Stack,
      apiGwKdsLambdaStack
    }
  }
}
