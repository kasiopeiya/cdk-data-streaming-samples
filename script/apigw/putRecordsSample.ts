/**
 * API Gateway - Kinesis Data Streams構成用のサンプルデータ送信スクリプト
 * 複数レコードを同時に送信するKDS PutRecords API使用バージョン
 * IAM認可設定のためリクストの署名が必要、署名には環境変数のアクセスキー、なければIAM Roleを使用する
 * 接続先API GWのURLがParamemter Storeに登録されている必要あり
 */
import axios, { type AxiosError } from 'axios'
import { SignatureV4 } from '@aws-sdk/signature-v4'
import { HttpRequest } from '@aws-sdk/protocol-http'
import {
  type HttpRequest as HttpRequest_,
  type AwsCredentialIdentity,
  type Provider
} from '@smithy/types'
import { Sha256 } from '@aws-crypto/sha256-js'
import { Agent as HttpsAgent } from 'https'
import * as winston from 'winston'
import plimit, { type LimitFunction } from 'p-limit'
import { faker } from '@faker-js/faker'
import {
  GetParameterCommand,
  type GetParameterHistoryCommandInput,
  SSMClient
} from '@aws-sdk/client-ssm'
import { defaultProvider } from '@aws-sdk/credential-provider-node'

import { config } from './putRecordsSampleConfig'
import { generateSampleRecord, type RecordData } from '../recordData'

// 実行条件
const region = config.region
const concurrentExecution = config.concurrentExecution
const totalSendCount = config.totalSendCount
const sendInterval = config.sendInterval
const baseRecordNumberPerRequest = config.baseRecordNumberPerRequest
const baseRecordSize = config.baseRecordSize
const retryInterval = config.retryInterval
const maxRetryCount = config.maxRetryCount
const apiGwUrlParamKey = config.apiGwUrlParamKey
const apiGwPath = config.apiGwPath

// カウントアップパラメータ
const incrementalParameters = config.incrementalParameters ?? {}
const maxRecordNumberPerRequest =
  incrementalParameters.maxRecordNumberPerRequest ?? baseRecordNumberPerRequest
const maxRecordSize = incrementalParameters.maxRecordSize ?? baseRecordSize

// 並列実行数の制御
const limit: LimitFunction = plimit(concurrentExecution)

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.cli(),
    winston.format.printf((info) => `[${info.timestamp}]${info.level}${info.message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'PutRecordsSample.log' })
  ]
})

/**
 * Kinesis Recordのインターフェース
 */
interface KinesisRecord {
  /** 送信したいデータをstring変換したもの */
  data: string
  PartitionKey: string
}
/**
 * HTTPリクエスト送信時のインターフェース
 */
interface Payload {
  records: KinesisRecord[]
}

/**
 * APIGWからのレスポンスデータ
 */
interface ApiGwResponseData {
  Code: string
  Message: string
  FailedRecordCount: string
}

/**
 * エントリーポイント
 */
const main = async (): Promise<void> => {
  const url_ = await createApiGwUrlWithPath(apiGwPath)
  for (let currentSendCount = 1; currentSendCount <= totalSendCount; currentSendCount++) {
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
      // 送信データ作成
      const payload: Payload = { records: generateRecords(requestId, numOfData, recordSize) }
      // HTTPリクエスト作成
      const request = createHTTPRequest(url_, payload)
      // リクエスト署名: APIGW IAM認可機能
      const signedRequest = await signHttpReqeust(request)
      tasks.push(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        limit(async () => {
          await sendRequest(url_, signedRequest, requestId, maxRetryCount)
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
 * 接続先API GWのURLオブジェクトを生成
 * @param path 接続先URLのパス部分、先頭の'/'歯含めない
 * @example createApiGwUrlWithPath('streams/records')
 * @returns
 */
const createApiGwUrlWithPath = async (path: string): Promise<URL> => {
  const apiUrl = await getParameter(apiGwUrlParamKey)
  return new URL(`${apiUrl}${path}`)
}

/**
 * Parameter Storeに登録されたデータ取得
 * @param key
 * @returns
 */
const getParameter = async (key: string): Promise<string> => {
  const client = new SSMClient({ region })
  const params: GetParameterHistoryCommandInput = {
    Name: key,
    WithDecryption: false
  }
  const command = new GetParameterCommand(params)
  const store = await client.send(command)
  if (store.Parameter?.Value === undefined) {
    throw new Error('ParameterStoreからのデータ取得に失敗しました')
  }
  return store.Parameter.Value
}

/**
 * テストデータを生成する
 * @param requestId 追跡用のリクエストID
 * @param numOfData 生成するレコード数
 * @param recordSize 生成するレコードサイズ
 * @returns
 */
const generateRecords = (
  requestId: string,
  numOfData: number,
  recordSize: number
): KinesisRecord[] => {
  const records: KinesisRecord[] = []

  for (let recordIndex = 1; recordIndex <= numOfData; recordIndex++) {
    const recordData: RecordData = generateSampleRecord(recordSize, requestId)
    const record: KinesisRecord = {
      data: JSON.stringify(recordData),
      PartitionKey: recordData.recordId
    }
    records.push(record)
  }
  return records
}

/**
 * HTTPリクエストを作成
 * @param payload
 * @returns
 */
function createHTTPRequest(url_: URL, payload: Payload): HttpRequest_ {
  const req = new HttpRequest({
    method: 'PUT',
    path: url_.pathname,
    hostname: url_.hostname,
    headers: {
      'content-type': 'application/json',
      Host: url_.hostname
    },
    body: JSON.stringify(payload)
  })
  return req
}

/**
 * IAM認証のためHTTPリクエストを署名V4で署名する
 * @param req
 * @returns
 */
const signHttpReqeust = async (req: HttpRequest_): Promise<HttpRequest_> => {
  const signer = new SignatureV4({
    credentials: createAWSCredentials(),
    region: 'ap-northeast-1',
    service: 'execute-api',
    sha256: Sha256
  })
  // eslint-disable-next-line @typescript-eslint/return-await
  return await signer.sign(req)
}

/**
 * AWS Credential情報を生成する
 */
const createAWSCredentials = (): AwsCredentialIdentity | Provider<AwsCredentialIdentity> => {
  const accessKey = process.env.AWS_ACCESS_KEY
  const secretAccessKey_ = process.env.AWS_SECRET_ACCESS_KEY
  if (accessKey !== undefined && secretAccessKey_ !== undefined) {
    // 環境変数からCredential生成
    return {
      accessKeyId: accessKey,
      secretAccessKey: secretAccessKey_
    }
  }
  // IAM RoleからCredential生成(EC2, CodeBuildなど)
  return defaultProvider()
}

/**
 * API Gatewayに対してリクエスト送信
 * @param httpRequest
 * @param retries
 */
const sendRequest = async (
  url_: URL,
  httpRequest: HttpRequest_,
  requestId: string,
  retries: number = 3
): Promise<void> => {
  try {
    const response = await axios.request({
      method: httpRequest.method,
      url: url_.toString(),
      headers: httpRequest.headers,
      httpsAgent: new HttpsAgent({
        rejectUnauthorized: true
      }),
      data: httpRequest.body
    })
    const data: ApiGwResponseData = response.data
    logger.info(
      `SUCCESS: requestId: ${requestId}, status: ${response.status} ${response.statusText}, FailedRecordCount: ${data.FailedRecordCount}`
    )
  } catch (e: any) {
    if ((e as AxiosError).response === undefined) {
      // レスポンスがない場合
      logger.warn('No respnose received.')
    } else {
      // エラーレスポンス出力
      logger.warn(
        `WARNING: requestId: ${requestId}, status: ${e.response.status} ${JSON.stringify(e.response.data)}`
      )
    }

    if (retries > 0) {
      // リトライ
      logger.warn(` RETRY: Request ${requestId} failed. Retrying... (${retries} retries left)`)
      await wait(retryInterval)
      await sendRequest(url_, httpRequest, requestId, retries - 1)
    } else {
      // 異常終了
      logger.error(`  FAILED: Request ${requestId} failed.`)
    }
  }
}

/**
 * 指定した秒数待機する
 * @param ms
 */
const wait = async (second: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, second * 1000)
  })
}

void main()
