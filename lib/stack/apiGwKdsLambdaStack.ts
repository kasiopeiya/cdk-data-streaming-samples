import { Stack, type StackProps } from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { type Vpc } from 'aws-cdk-lib/aws-ec2'

import { KdsPrivateApiGwProducer } from '../construct/kdsApiGwProducer'
import { KdsLambdaConsumer } from '../construct/kdsLambdaConsumer'
import { KdsCWDashboard } from '../construct/kdsCWDashboard'
// import { type Alarm } from 'aws-cdk-lib/aws-cloudwatch'
import { KdsDataStream } from '../construct/kdsDataStream'

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

    /*
    * Kinesis Data Streams
    -------------------------------------------------------------------------- */
    const kdsDataStream = new KdsDataStream(this, 'KdsDataStream')

    /*
    * Producer側
    -------------------------------------------------------------------------- */
    const producer = new KdsPrivateApiGwProducer(this, 'KdsPrivateApiGwProducer', {
      dataStream: kdsDataStream.dataStream,
      vpc: props.vpc
    })

    /*
    * Consumer側
    -------------------------------------------------------------------------- */
    const consumer = new KdsLambdaConsumer(this, 'KdsLambdaConsumer', {
      prefix: props.prefix,
      dataStream: kdsDataStream.dataStream,
      lambdaEntry: './resources/lambda/kinesis/index.ts',
      billing: dynamodb.Billing.onDemand()
    })

    /*
    * Monitoring
    -------------------------------------------------------------------------- */
    // Alarm
    // const writePrvAlarm: Alarm = kdsDataStream.createWriteProvisionedAlarm()
    // const readPrvAlarm: Alarm = kdsDataStream.createReadProvisionedAlarm()
    // const iteratorAgeAlarm: Alarm = kdsDataStream.createIteratorAgeAlarm()
    // const apiGwClientErrorAlarm: Alarm = producer.createClientErrorAlarm()
    // const apiGwServerErrorAlarm: Alarm = producer.createServerErrorAlarm()
    // const lambdaErrorsAlarm: Alarm = consumer.createLambdaErrorsAlarm()
    // const dlqMessageSentAlarm: Alarm = consumer.createDLQMessagesSentAlarm()

    // Dashboard
    new KdsCWDashboard(this, 'KdsCWDashborad', {
      prefix: props.prefix,
      dataStream: kdsDataStream.dataStream,
      restApi: producer.restApi,
      lambdaFunction: consumer.kdsConsumerFunction
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
