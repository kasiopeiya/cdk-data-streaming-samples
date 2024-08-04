/**
 * API Gateway - Kinesis Data Streams構成用のサンプルデータ送信スクリプト
 * 1レコードずつ送信するKDS PutRecord API使用バージョン
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

import { config } from './putRecordSampleConfig'
import { generateSampleRecord, type RecordData } from '../recordData'

// 実行条件
const region = config.region
const totalSendTimeMin = config.totalSendTimeMin
const requestsPerMin = config.requestsPerMin
const baseRecordSize = config.baseRecordSize
const retryInterval = config.retryInterval
const maxRetryCount = config.maxRetryCount
const apiGwUrlParamKey = config.apiGwUrlParamKey
const apiGwPath = config.apiGwPath

// 並列実行数の制御
const limit: LimitFunction = plimit(requestsPerMin)

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
    new winston.transports.File({ filename: 'PutRecordSample.log' })
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
  for (
    let currentExecutionTimeMin = 1;
    currentExecutionTimeMin <= totalSendTimeMin;
    currentExecutionTimeMin++
  ) {
    console.log(`${currentExecutionTimeMin}/${totalSendTimeMin}`)

    const tasks: Array<Promise<void>> = []
    for (
      let requetIndexInOneMin = 1;
      requetIndexInOneMin <= requestsPerMin;
      requetIndexInOneMin++
    ) {
      // 1分内でのリクエスト送信タイミングはランダムにする
      let interval: number = getRandomRequestInterval()
      if (requetIndexInOneMin === requestsPerMin) {
        interval = 55 * 1000
      }
      const requestIdPrefix = `${currentExecutionTimeMin}-${requetIndexInOneMin}-`
      const requestIdLength = 20
      const requestId = `${requestIdPrefix}${faker.string.alphanumeric(requestIdLength - requestIdPrefix.length)}`
      // レコード作成
      const recordData: RecordData = generateSampleRecord(baseRecordSize, requestId)
      const record: KinesisRecord = {
        data: JSON.stringify(recordData),
        PartitionKey: recordData.recordId
      }
      // HTTPリクエスト作成
      const request = createHTTPRequest(url_, record)
      // リクエスト署名: APIGW IAM認可機能
      const signedRequest = await signHttpReqeust(request)
      // ランダム時間待機後リクエストを送信するタスクリスト作成
      tasks.push(
        limit(async () => {
          await new Promise((resolve) => setInterval(resolve, interval))
          await sendRequest(url_, signedRequest, requestId, maxRetryCount)
        })
      )
    }
    // タスクを非同期に同時実行、リクエストは１分内でランダム分散
    await Promise.all(tasks)
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
 * ランダムなリクエストインターバルを生成する
 * @returns リクエストインターバル(ms)
 */
const getRandomRequestInterval = (): number => {
  // １分をミリ秒に変換、ただし60秒だと全リクエスト完了に１分以上かかるので、５０秒で計算
  const oneMinInSecond = 50 * 1000
  return Math.random() * oneMinInSecond
}

/**
 * HTTPリクエストを作成
 * @param payload
 * @returns
 */
function createHTTPRequest(url_: URL, record: KinesisRecord): HttpRequest_ {
  const req = new HttpRequest({
    method: 'PUT',
    path: url_.pathname,
    hostname: url_.hostname,
    headers: {
      'content-type': 'application/json',
      Host: url_.hostname
    },
    body: JSON.stringify(record)
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
      // 以上終了
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
