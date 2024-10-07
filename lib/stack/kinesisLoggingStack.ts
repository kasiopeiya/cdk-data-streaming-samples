import { Stack, type StackProps, Tags } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { Bucket } from 'aws-cdk-lib/aws-s3'

import { TrailDataStream } from '../construct/trailDataStream'

interface KinesisLoggingStackProps extends StackProps {
  trailBucket: Bucket
}

/**
 *
 */
export class KinesisLoggingStack extends Stack {
  constructor(scope: Construct, id: string, props: KinesisLoggingStackProps) {
    super(scope, id, props)

    Tags.of(this).add('StackName', this.stackName)

    /*
    * CloudTrail
    -------------------------------------------------------------------------- */
    new TrailDataStream(this, 'TrailDataStream', {
      trailBucket: props.trailBucket
    })
  }
}
