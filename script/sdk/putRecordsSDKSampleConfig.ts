interface Config {
  /** リージョン */
  region: string
  /** データストリーム名が格納されたParamter Storeのkey名 */
  dataStreamNameParamKey: string
  /** リクエスト送信回数 */
  totalSendCount: number
  /** リクエストの並列実行数 */
  concurrentExecution: number
  /** 送信インターバル(秒) */
  sendInterval: number
  /** リクエストあたりレコード数 */
  baseRecordNumberPerRequest: number
  /** １レコードのサイズ(Byte) */
  baseRecordSize: number
  /** リトライ間隔(秒) */
  retryInterval: number
  /** 最大リトライ回数 */
  maxRetryCount: number
  /** 最大時のリクエストあたりレコード数 */
  maxRecordNumberPerRequest: number
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
  dataStreamNameParamKey: '/firehoseS3/kds/dataStreamName',
  totalSendCount: 30,
  concurrentExecution: 3,
  sendInterval: 5,
  baseRecordNumberPerRequest: 100,
  maxRecordNumberPerRequest: 100,
  baseRecordSize: 100,
  retryInterval: 1,
  maxRetryCount: 4
  // incrementalParameters: {
  //   maxRecordNumberPerRequest: 500,
  //   maxRecordSize: 900
  // }
}
