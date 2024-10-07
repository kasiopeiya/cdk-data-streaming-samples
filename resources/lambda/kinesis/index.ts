import { Tracer } from '@aws-lambda-powertools/tracer'
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware'
import middy from '@middy/core'
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DeleteCommand, PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch'
import * as winston from 'winston'

interface EventProps {
  Records: KinesisRecord[]
}

/**
 * KDS DataStreamから受け取るレコードデータのスキーマ
 */
interface KinesisRecord {
  kinesis: {
    kinesisSchemaVersion: string
    partitionKey: string
    sequenceNumber: string
    data: string
    approximateArrivalTimestamp: number
  }
  eventSource: string
  eventVersion: string
  eventID: string
  eventName: string
  invokeIdentityArn: string
  awsRegion: string
  eventSourceARN: string
}

const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)

// 環境変数
const envVariables = [
  process.env.TABLE_NAME,
  process.env.AWS_DEFAULT_REGION,
  process.env.NAMESPACE,
  process.env.METRIC_NAME,
  process.env.FUNCTION_NAME
]
for (const envVariable of envVariables) {
  if (envVariable === undefined) throw new Error('Some environment variables is not set')
}
// DynamoDB テーブル名
const tableName = process.env.TABLE_NAME
// 使用リージョン、Lambdaのデフォルトで設定されている
const region = process.env.AWS_DEFAULT_REGION
// カスタムメトリクスの名前空間
const nameSpace = process.env.NAMESPACE
// カスタムメトリクスのメトリック名
const metricName = process.env.METRIC_NAME
// カスタムメトリクス送信時に使用する関数名
const functionName = process.env.FUNCTION_NAME

// X-Ray Tracer
const tracer = new Tracer({ serviceName: 'KinesisConsumerLambda' })

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.cli(),
    winston.format.printf((info) => `[${info.timestamp}] ${info.level} ${info.message}`)
  ),
  transports: [new winston.transports.Console()]
})

/**
 * ハンドラー関数
 * @param event
 */
const lambdaHandler = async (
  event: EventProps
): Promise<void | { batchItemFailures: object[] }> => {
  // X-Rayトレース
  tracer.captureAWSv3Client(dynamoClient)

  // CloudWatchカスタムメトリクス送信
  // バッチサイズ
  const batchSize = event.Records.length
  await sendMetricToCloudWatch(batchSize)
  logger.info(`Lambda Start: batch size ${batchSize}`)

  for (const record of event.Records) {
    const decodedData: string = Buffer.from(record.kinesis.data, 'base64').toString('utf-8')
    const recordData = JSON.parse(decodedData)
    const currentDate = new Date()

    // 重複管理用DynamoDBテーブルにデータを保存
    const command = new PutCommand({
      TableName: tableName,
      Item: {
        recordId: recordData.recordId,
        eventId: record.eventID, // shardId:sequenceNumber
        data: decodedData,
        createdAt: currentDate.getTime(),
        expired: currentDate.setDate(currentDate.getDate() + 1) // TTL, 1日後に削除
      },
      ConditionExpression: 'attribute_not_exists(recordId)' // 条件付き書き込み, recordIdの重複禁止
    })
    try {
      // アイテムの登録
      const response = await docClient.send(command)
      logger.info(
        `SUCCESS: id=${recordData.recordId}, statusCode=${response.$metadata.httpStatusCode}`
      )
    } catch (e: ConditionalCheckFailedException | unknown) {
      if (e instanceof ConditionalCheckFailedException) {
        // 条件付き書き込みエラー, アイテムがテーブルにすでにあった場合
        logger.warn(`RETRY: id=${recordData.recordId} 登録済みのため処理をスキップします`)
        continue
      } else {
        // それ以外のエラーの場合, DynamoDBのスロットリングなど
        logger.error(`FAILED: id=${recordData.recordId} エラーのため処理を中断します`)
        // エラー処理のレポート, エラーになったところから処理を再開させるためsequenceNumberを返す
        return {
          batchItemFailures: [{ itemIdentifier: record.kinesis.sequenceNumber }]
        }
      }
    }

    try {
      // やりたい処理を記載
    } catch (e: unknown) {
      logger.error(e)
      // 再実行のため、DynamoDBからレコード削除
      const command = new DeleteCommand({
        TableName: tableName,
        Key: { recordId: recordData.recordId }
      })
      await docClient.send(command)
      return {
        batchItemFailures: [{ itemIdentifier: record.kinesis.sequenceNumber }]
      }
    }
  }
}

export const handler = middy(lambdaHandler).use(captureLambdaHandler(tracer))

/**
 * メトリクスデータを送信する
 * @param metricValue 送信するメトリックデータ
 */
async function sendMetricToCloudWatch(metricValue: number): Promise<void> {
  const cloudwatchClient = new CloudWatchClient({ region })
  const command = new PutMetricDataCommand({
    Namespace: nameSpace,
    MetricData: [
      {
        MetricName: metricName,
        Value: metricValue,
        Unit: 'Count',
        Dimensions: [{ Name: 'functionName', Value: functionName }]
      }
    ]
  })
  await cloudwatchClient.send(command)
}
