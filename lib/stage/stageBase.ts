import { type Stack, Stage } from 'aws-cdk-lib'
import { type Construct } from 'constructs'

import { type Config } from '../../config'
import { BaseStack } from '../stack/baseStack'
import { DeliveryS3Stack } from '../stack/deliveryS3Stack'
import { ApiGwKdsLambdaStack } from '../stack/apiGwKdsLambdaStack'

export abstract class StageBase extends Stage {
  createCommonStacks(scope: Construct, config: Config): Record<string, Stack> {
    const prefix: string = config.prefix
    const env = config.env

    /*
    * ステートフルリソース用スタック
    -------------------------------------------------------------------------- */
    const baseStack = new BaseStack(scope, `${prefix}-base-stack`, { env })

    /*
    * S3配信構成用スタック
    -------------------------------------------------------------------------- */
    const deliveryS3Stack = new DeliveryS3Stack(scope, `${prefix}-sample-delivery-s3-stack`, {
      env,
      prefix: config.prefix,
      bucket: baseStack.firehoseBucket,
      enableLambdaProcessor: true,
      s3BackupOptions: {
        bucket: baseStack.firehoseBkBucket
      }
    })

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

    return {
      baseStack,
      deliveryS3Stack,
      apiGwKdsLambdaStack
    }
  }
}
