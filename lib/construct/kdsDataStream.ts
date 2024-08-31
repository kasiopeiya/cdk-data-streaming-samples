import { Construct } from 'constructs'
import { Stream, type StreamProps, StreamMode } from 'aws-cdk-lib/aws-kinesis'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { RemovalPolicy, Stack } from 'aws-cdk-lib'

interface KdsDataStreamProps {
  dataStreamProps?: StreamProps
}

export class KdsDataStream extends Construct {
  public readonly dataStream: Stream

  constructor(scope: Construct, id: string, props?: KdsDataStreamProps) {
    super(scope, id)

    /*
    * Kinesis Data Streams
    -------------------------------------------------------------------------- */
    this.dataStream = new Stream(this, 'Resource', {
      shardCount: 1,
      streamMode: StreamMode.PROVISIONED,
      removalPolicy: RemovalPolicy.DESTROY,
      ...props?.dataStreamProps
    })

    /*
    *  SSM Parameter Store
    -------------------------------------------------------------------------- */
    // dataStream名を登録
    // producer scriptで利用
    new ssm.StringParameter(this, 'parameter', {
      parameterName: `/${Stack.of(this).stackName}/stream/name`,
      stringValue: this.dataStream.streamName
    })
  }
}
