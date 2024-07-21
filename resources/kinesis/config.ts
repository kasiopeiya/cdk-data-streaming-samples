interface Config {
  /** リージョン */
  region: string
  /** データストリーム名が格納されたParamter Storeのkey名 */
  dataStreamNameParamKey: string
  /** リクエスト送信回数 */
  totalSendCount: number
  /** 送信インターバル(秒) */
  sendInterval: number
  /** 開始時のリクエストあたりレコード数 */
  initialRecordNumberPerRequest: number
  /** 最大時のリクエストあたりレコード数 */
  maxRecordNumberPerRequest: number
  /** １レコードのサイズ(Byte) */
  recordSize: number
  /** リトライ間隔(秒) */
  retryInterval: number
  /** 最大リトライ回数 */
  maxRetryCount: number
}

export const config: Config = {
  region: 'ap-northeast-1',
  dataStreamNameParamKey: '/firehoseS3/kds/dataStreamName',
  totalSendCount: 30,
  sendInterval: 5,
  initialRecordNumberPerRequest: 100,
  maxRecordNumberPerRequest: 100,
  recordSize: 100,
  retryInterval: 1,
  maxRetryCount: 4
}
