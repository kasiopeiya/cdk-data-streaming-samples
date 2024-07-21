import { Construct } from 'constructs'
import { Stream, type StreamProps, StreamMode } from 'aws-cdk-lib/aws-kinesis'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { RemovalPolicy } from 'aws-cdk-lib'

interface KdsDataStreamProps {
  parameterKeyName: string
  dataStreamProps?: StreamProps
}

export class KdsDataStream extends Construct {
  public readonly dataStream: Stream

  constructor(scope: Construct, id: string, props: KdsDataStreamProps) {
    super(scope, id)

    // Kinesis Data Streams
    this.dataStream = new Stream(this, 'Resource', {
      shardCount: props.dataStreamProps?.shardCount ?? 1,
      streamMode: StreamMode.PROVISIONED,
      removalPolicy: RemovalPolicy.DESTROY,
      // streamMode: StreamMode.ON_DEMAND,
      ...props.dataStreamProps
    })

    // SSM Parameter Store
    new ssm.StringParameter(this, 'parameter', {
      parameterName: props.parameterKeyName,
      stringValue: this.dataStream.streamName
    })
  }
}
