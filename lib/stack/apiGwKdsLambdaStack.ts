import { Stack, Tags, type StackProps } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { type Vpc } from 'aws-cdk-lib/aws-ec2'
import { StreamMode, type CfnStream } from 'aws-cdk-lib/aws-kinesis'
import { type Alarm } from 'aws-cdk-lib/aws-cloudwatch'
import * as cwAction from 'aws-cdk-lib/aws-cloudwatch-actions'

import { KdsApiGwProducer } from '../construct/kdsApiGwProducer'
import { KdsLambdaConsumer } from '../construct/kdsLambdaConsumer'
import { KdsCWDashboard } from '../construct/kdsCWDashboard'
import { KdsDataStream } from '../construct/kdsDataStream'
import { KdsScaleOutLambda } from '../construct/kdsScaleOutLambda'

interface ApiGwKdsLambdaStackProps extends StackProps {
  prefix: string
  /** Private APIGW使用時にエンドポイントを作成するVPC */
  vpc?: Vpc
}

/**
 * APIGWにプロキシされたKDSとLambda Consumer構成
 */
export class ApiGwKdsLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiGwKdsLambdaStackProps) {
    super(scope, id, props)

    Tags.of(this).add('StackName', this.stackName)

    /*
    * Kinesis Data Streams
    -------------------------------------------------------------------------- */
    const kdsDataStream = new KdsDataStream(this, 'KdsDataStream')

    /*
    * Producer側
    -------------------------------------------------------------------------- */
    const producer = new KdsApiGwProducer(this, 'KdsApiGwProducer', {
      dataStream: kdsDataStream.dataStream,
      vpc: props.vpc
    })

    /*
    * Consumer側
    -------------------------------------------------------------------------- */
    const consumer = new KdsLambdaConsumer(this, 'KdsLambdaConsumer', {
      dataStream: kdsDataStream.dataStream,
      lambdaEntry: './resources/lambda/kinesis/index.ts',
      billing: dynamodb.Billing.onDemand()
    })

    /*
    * Monitoring
    -------------------------------------------------------------------------- */
    // Alarm
    const writePrvAlarm: Alarm = kdsDataStream.createWriteProvisionedAlarm()
    const readPrvAlarm: Alarm = kdsDataStream.createReadProvisionedAlarm()
    const iteratorAgeAlarm: Alarm = kdsDataStream.createIteratorAgeAlarm()
    const apiGwClientErrorAlarm: Alarm = producer.createClientErrorAlarm()
    const apiGwServerErrorAlarm: Alarm = producer.createServerErrorAlarm()
    const lambdaErrorsAlarm: Alarm = consumer.createLambdaErrorsAlarm()
    const dlqMessageSentAlarm: Alarm = consumer.createDLQMessagesSentAlarm()
    const cwAlarms: Alarm[] = [
      writePrvAlarm,
      readPrvAlarm,
      iteratorAgeAlarm,
      apiGwClientErrorAlarm,
      apiGwServerErrorAlarm,
      lambdaErrorsAlarm,
      dlqMessageSentAlarm
    ]

    // Alarm Action
    const cfnStream = kdsDataStream.dataStream.node.defaultChild as CfnStream
    const capacityMode = (cfnStream.streamModeDetails as CfnStream.StreamModeDetailsProperty)
      .streamMode
    if (capacityMode === StreamMode.PROVISIONED) {
      // BUG: cdkのバグで同じLambda関数を複数のAlarm Actionに設定するとエラーになるため、複数のLambdaを用意
      const kdsScaleOutLambda1 = new KdsScaleOutLambda(this, 'KdsScaleOutLambda1', {
        dataStream: kdsDataStream.dataStream
      })
      const kdsScaleOutLambda2 = new KdsScaleOutLambda(this, 'KdsScaleOutLambda2', {
        dataStream: kdsDataStream.dataStream
      })
      writePrvAlarm.addAlarmAction(new cwAction.LambdaAction(kdsScaleOutLambda1.func))
      readPrvAlarm.addAlarmAction(new cwAction.LambdaAction(kdsScaleOutLambda2.func))
    }

    // Dashboard
    new KdsCWDashboard(this, 'KdsCWDashborad', {
      alarms: cwAlarms,
      dataStream: kdsDataStream.dataStream,
      restApi: producer.restApi,
      lambdaFunction: consumer.kdsConsumerFunction,
      lambdaDlq: consumer.dlq
    })

    /*
    * 出力
    -------------------------------------------------------------------------- */
    // CloudWatch Logs Live Tail CLIコマンド
    // Consumer Lambda関数ログ
    const logGroupArn = `arn:aws:logs:${this.region}:${this.account}:log-group:${consumer.logGroup.logGroupName}`
    this.exportValue(`aws logs start-live-tail --log-group-identifiers ${logGroupArn}`, {
      name: `${this.stackName}-lambda-log-live-tail-cli-command`
    })
  }
}
