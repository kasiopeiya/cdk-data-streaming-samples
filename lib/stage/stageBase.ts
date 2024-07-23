import { type Stack, Stage } from 'aws-cdk-lib'
import { type Construct } from 'constructs'

import { type Config } from '../../config'
import { BaseStack } from '../stack/baseStack'
import { DeliveryS3Stack } from '../stack/deliveryS3Stack'

export abstract class StageBase extends Stage {
  createCommonStacks(scope: Construct, config: Config): Record<string, Stack> {
    const prefix: string = config.prefix
    const env = config.env

    /*
    * ステートフルリソース用スタック
    -------------------------------------------------------------------------- */
    const baseStack = new BaseStack(scope, 'base-stack', { env })

    /*
    * S3配信構成用スタック
    -------------------------------------------------------------------------- */
    const deliveryS3Stack = new DeliveryS3Stack(scope, `${prefix}-delivery-s3-stack`, {
      env,
      prefix: config.prefix,
      bucket: baseStack.firehoseBucket,
      enableLambdaProcessor: true,
      s3BackupOptions: {
        bucket: baseStack.firehoseBkBucket
      }
    })

    return {
      baseStack,
      deliveryS3Stack
    }
  }
}
