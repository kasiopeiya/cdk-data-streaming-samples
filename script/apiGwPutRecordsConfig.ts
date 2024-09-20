interface Config {
  /** リージョン */
  region: string
  /** リクエストの並列実行数 */
  concurrentExecution: number
  /** リクエスト送信回数 */
  totalSendCount: number
  /** 送信インターバル(秒) */
  sendInterval: number
  /** 開始時のリクエストあたりレコード数 */
  baseRecordNumberPerRequest: number
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
  /** カウントアップ設定、インターバルごとに+1 */
  incrementalParameters?: {
    /** 最大時のリクエストあたりレコード数 */
    maxRecordNumberPerRequest?: number
    /** １レコードの最大サイズ */
    maxRecordSize?: number
  }
}

export const config: Config = {
  region: 'ap-northeast-1',
  concurrentExecution: 3,
  totalSendCount: 10,
  sendInterval: 5,
  baseRecordNumberPerRequest: 100,
  baseRecordSize: 210,
  retryInterval: 1,
  maxRetryCount: 4,
  apiGwUrlParamKey: '/apiGwKds/dev-data-str-sample-apigw-kds-lambda-stack/url',
  apiGwPath: 'streams/records'
  // incrementalParameters: {
  //   maxRecordNumberPerRequest: 200,
  //   maxRecordSize: 200
  // }
}
