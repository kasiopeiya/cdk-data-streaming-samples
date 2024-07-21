import * as path from 'path'
import { type Stack, Stage, Duration } from 'aws-cdk-lib'
import { type Construct } from 'constructs'

import { type Config } from '../../config'
import { BaseStack } from '../stack/baseStack'
import { DeliveryS3Stack } from '../stack/deliveryS3Stack'

export abstract class StageBase extends Stage {
  createCommonStacks(scope: Construct, config: Config): Record<string, Stack> {
    const prefix: string = config.prefix
    const env = config.env

    const baseStack = new BaseStack(scope, `${prefix}-base-stack`, { env })
    const deliveryS3Stack = new DeliveryS3Stack(scope, `${prefix}-delivery-s3-stack`, {
      env,
      prefix: config.prefix,
      bucket: baseStack.firehoseBucket,
      bufferingInterval: Duration.seconds(0),
      lambdaProcessing: {
        enable: false,
        bkBucket: baseStack.firehoseBkBucket,
        lambdaEntry: path.join(
          'resources',
          'lambda',
          'firehoseProcessor',
          'dynamicPartitioning',
          'python'
        )
      }
    })

    return {
      baseStack,
      deliveryS3Stack
    }
  }
}
