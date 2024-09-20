interface Config {
  /** リージョン */
  region: string
  /** リクエスト送信分数 */
  totalSendTimeMin: number
  /** 分あたりのリクエスト数 */
  requestsPerMin: number
  /** １レコードのサイズ(Byte) */
  baseRecordSize: number
  /** リトライ間隔(秒) */
  retryInterval: number
  /** 最大リトライ回数 */
  maxRetryCount: number
  /** API GW URLが格納されたParamter Storeのkey名 */
  apiGwUrlParamKey: string
  /** API GW接続先のパス */
  apiGwPath: string
}

export const config: Config = {
  region: 'ap-northeast-1',
  totalSendTimeMin: 3,
  requestsPerMin: 100,
  baseRecordSize: 200,
  retryInterval: 1,
  maxRetryCount: 4,
  apiGwUrlParamKey: '/apiGwKds/dev-data-str-sample-apigw-kds-lambda-stack/url',
  apiGwPath: 'streams/record'
}
