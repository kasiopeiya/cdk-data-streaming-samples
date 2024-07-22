/** AWS SDKでKDSにレコードを送信するスクリプト */

import * as winston from 'winston'
import {
  KinesisClient,
  PutRecordsCommand,
  type PutRecordsInput,
  type PutRecordsCommandOutput,
  type PutRecordsRequestEntry
} from '@aws-sdk/client-kinesis'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'

import { config } from './config'

// 実行条件
const totalSendCount = config.totalSendCount
const sendInterval = config.sendInterval
const initialRecordNumberPerRequest = config.initialRecordNumberPerRequest
const maxRecordNumberPerRequest = config.maxRecordNumberPerRequest
const recordSize = config.recordSize
const retryInterval = config.retryInterval
const maxRetryCount = config.maxRetryCount

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
 * ランダム文字列生成
 * @param charCount
 * @returns
 */
function generateRandomString(charCount: number = 7): string {
  const str = Math.random().toString(36).substring(2).slice(-charCount)
  return str.length < charCount ? str + 'a'.repeat(charCount - str.length) : str
}

/**
 * テストレコードデータを生成する
 * @param sendCount 何回目の送信かを示す数字
 * @param requestId 追跡用リクエストID
 * @param numOfData 生成したいレコード数
 * @returns 生成されたレコードリスト
 */
function generateRecords(
  sendCount: number,
  requestId: string,
  numOfData: number
): PutRecordsRequestEntry[] {
  const records: PutRecordsRequestEntry[] = []

  const trueFalse = [true, false] as const
  const dataTypes = ['free', 'normal', 'premium'] as const
  const producerId = 'p00001'
  const extraData = 'A'.repeat(recordSize - 55) // idなどの固定値分をマイナス

  for (let i = 1; i < 1 + numOfData; i++) {
    const recordId = `id-${sendCount}-${requestId}-${i}`
    const timeStamp = Date.now()
    const email = `hoge${i}_${sendCount}@mail.com`

    // ランダム設定
    const notificationFlag = trueFalse[Math.floor(Math.random() * trueFalse.length)]
    const dataType = dataTypes[Math.floor(Math.random() * dataTypes.length)]

    const record: PutRecordsRequestEntry = {
      Data: Buffer.from(
        JSON.stringify({
          recordId,
          requestId,
          producerId,
          timeStamp,
          email,
          notificationFlag,
          dataType,
          extraData
        })
      ),
      PartitionKey: recordId
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
      logger.warn(`WARNING: requestId: ${requestId}, FailedRecordCount: ${failedRecordCount}`)
      if (retries > 0) {
        logger.warn(` RETRY: Request ${requestId} failed. Retring..., (${retries}) retries left`)
        await wait(retryInterval)
        await sendRequest(command, requestId, retries - 1)
      }
    }
  } catch (error) {
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

/**
 * メイン処理
 */
async function main(): Promise<void> {
  for (let currentSendCount = 1; currentSendCount <= totalSendCount; currentSendCount++) {
    console.log(`${currentSendCount}/${totalSendCount}`)

    // dataStream名取得
    const dataStreamName = await getParameter(config.dataStreamNameParamKey)

    // 送信レコード数
    let numOfData: number = initialRecordNumberPerRequest + (currentSendCount - 1)
    if (maxRecordNumberPerRequest <= numOfData) {
      numOfData = maxRecordNumberPerRequest
    }

    // リクエストIDの採番
    const requestId1 = generateRandomString()
    const requestId2 = generateRandomString()
    const requestId3 = generateRandomString()

    // リクエストインプット作成
    const params1: PutRecordsInput = {
      Records: generateRecords(totalSendCount, requestId1, numOfData),
      StreamName: dataStreamName
    }
    const command1 = new PutRecordsCommand(params1)

    const params2: PutRecordsInput = {
      Records: generateRecords(totalSendCount, requestId2, numOfData),
      StreamName: dataStreamName
    }
    const command2 = new PutRecordsCommand(params2)

    const params3: PutRecordsInput = {
      Records: generateRecords(totalSendCount, requestId3, numOfData),
      StreamName: dataStreamName
    }
    const command3 = new PutRecordsCommand(params3)

    // レコード送信
    void Promise.all([
      sendRequest(command1, requestId1, maxRetryCount),
      sendRequest(command2, requestId2, maxRetryCount),
      sendRequest(command3, requestId3, maxRetryCount)
    ])

    await wait(sendInterval)
  }
}

void main()
