/**
 * AWS SDKでKDSにレコードを送信するスクリプト
 * 複数レコードを同時に送信するKDS PutRecords API使用
 */
import * as winston from 'winston'
import {
  KinesisClient,
  PutRecordsCommand,
  type PutRecordsInput,
  type PutRecordsCommandOutput,
  type PutRecordsRequestEntry
} from '@aws-sdk/client-kinesis'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import plimit, { type LimitFunction } from 'p-limit'
import { faker } from '@faker-js/faker'

import { config } from './putRecordsSDKSampleConfig'
import { generateSampleRecord, type RecordData } from '../recordData'

// 実行条件
const concurrentExecution = config.concurrentExecution
const totalSendCount = config.totalSendCount
const sendInterval = config.sendInterval
const baseRecordNumberPerRequest = config.baseRecordNumberPerRequest
const baseRecordSize = config.baseRecordSize
const retryInterval = config.retryInterval
const maxRetryCount = config.maxRetryCount

// カウントアップパラメータ
const incrementalParameters = config.incrementalParameters ?? {}
const maxRecordNumberPerRequest =
  incrementalParameters.maxRecordNumberPerRequest ?? baseRecordNumberPerRequest
const maxRecordSize = incrementalParameters.maxRecordSize ?? baseRecordSize

// 並列実行数の制御
const limit: LimitFunction = plimit(concurrentExecution)

const kinesisClient = new KinesisClient({ region: 'ap-northeast-1' })
const ssmClient = new SSMClient({ region: config.region })

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf((info) => `[${info.timestamp}] ${info.level} ${info.message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'putRecordsSDKSample.log' })
  ]
})

/**
 * メイン処理
 */
async function main(): Promise<void> {
  for (let currentSendCount = 1; currentSendCount <= totalSendCount; currentSendCount++) {
    // dataStream名取得
    const dataStreamName = await getParameter(config.dataStreamNameParamKey)

    // 送信レコード数計算
    let numOfData: number = baseRecordNumberPerRequest + (currentSendCount - 1)
    if (maxRecordNumberPerRequest <= numOfData) {
      numOfData = maxRecordNumberPerRequest
    }

    // データサイズ計算
    let recordSize: number = baseRecordSize + (currentSendCount - 1)
    if (maxRecordSize <= recordSize) {
      recordSize = maxRecordSize
    }

    console.log(
      `${currentSendCount}/${totalSendCount} ${numOfData} records per request, ${recordSize} bytes per record`
    )

    const tasks: Array<Promise<void>> = []
    for (let concurrentIndex = 1; concurrentIndex <= concurrentExecution; concurrentIndex++) {
      // リクエスト追跡用のIDを採番
      const requestIdPrefix = `${currentSendCount}-${concurrentIndex}-`
      const requestIdLength = 20
      const requestId = `${requestIdPrefix}${faker.string.alphanumeric(requestIdLength - requestIdPrefix.length)}`

      // リクエストインプット作成
      const params: PutRecordsInput = {
        Records: generateRecords(requestId, numOfData, recordSize),
        StreamName: dataStreamName
      }

      const command = new PutRecordsCommand(params)
      tasks.push(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        limit(async () => {
          await sendRequest(command, requestId, maxRetryCount)
        })
      )
    }

    // リクエスト送信
    await Promise.all(tasks)

    // インターバル
    await wait(sendInterval)
  }
}

/**
 * Parameter Store に登録されたデータの取得
 * @param key
 * @returns
 */
async function getParameter(key: string): Promise<string> {
  const params = {
    Name: key,
    WithDecryption: false
  }
  const command = new GetParameterCommand(params)
  const store = await ssmClient.send(command)
  if (store.Parameter?.Value === undefined) {
    throw new Error('Paramter Storeからのデータ取得に失敗')
  }
  return store.Parameter.Value
}

/**
 * テストレコードデータを生成する
 * @param requestId 追跡用リクエストID
 * @param numOfData 生成したいレコード数
 * @param recordSize 生成するレコードのサイズ
 * @returns 生成されたレコードリスト
 */
function generateRecords(
  requestId: string,
  numOfData: number,
  recordSize: number
): PutRecordsRequestEntry[] {
  const records: PutRecordsRequestEntry[] = []

  for (let recordIndex = 1; recordIndex <= numOfData; recordIndex++) {
    const recordData: RecordData = generateSampleRecord(recordSize, requestId)
    const record: PutRecordsRequestEntry = {
      Data: Buffer.from(JSON.stringify(recordData)),
      PartitionKey: recordData.recordId
    }
    records.push(record)
  }
  return records
}

/**
 * リクエストを送信する
 * @param command
 * @param retries リトライ回数
 */
async function sendRequest(
  command: PutRecordsCommand,
  requestId: string,
  retries: number = 4
): Promise<void> {
  try {
    const putRecordsOutput: PutRecordsCommandOutput = await kinesisClient.send(command)
    const failedRecordCount = putRecordsOutput.FailedRecordCount
    if (failedRecordCount === 0) {
      logger.info(`SUCCESS: requestId: ${requestId}, FailedRecordCount: ${failedRecordCount}`)
    } else {
      // 失敗したレコードが１つ以上あった場合
      logger.warn(`WARNING: requestId: ${requestId}, FailedRecordCount: ${failedRecordCount}`)
      if (retries > 0) {
        // リトライ
        logger.warn(` RETRY: Request ${requestId} failed. Retring..., (${retries}) retries left`)
        await wait(retryInterval)
        await sendRequest(command, requestId, retries - 1)
      }
    }
  } catch (error) {
    // 異常終了
    console.log(error)
    logger.error(` FAILED: Request ${requestId} failed`)
  }
}

/**
 * 指定した秒数待機する
 * @param second 待機秒数
 */
async function wait(second: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, second * 1000)
  })
}

void main()
