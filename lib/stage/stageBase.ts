import { type Stack, Stage, type Environment, Duration } from 'aws-cdk-lib'
import { type Construct } from 'constructs'

import { type Config } from '../../config'
import { BaseStack } from '../stack/baseStack'
import { DeliveryS3Stack } from '../stack/deliveryS3Stack'
import { ApiGwKdsLambdaStack } from '../stack/apiGwKdsLambdaStack'
import { SampleVpcStack } from '../stack/sampleVpcStack'

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
      baseVpcStack,
      deliveryS3Stack,
      apiGwKdsLambdaStack
    }
  }
}
