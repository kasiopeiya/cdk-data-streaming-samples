export const alarmDescriptionTable: string = `
| サービス       | アラーム名             | 検知される状況                                             | 対応                                                                    |
|------------|-------------------|-----------------------------------------------------|-----------------------------------------------------------------------|
| KDS        | write-provisioned | Producerの送信量がシャード規定を上回る                             | オンデマンドモードの場合: 自動でスケールアウトのため対応不要<br/>プロビジョンドモードの場合: 自動スケールアウトLambdaが起動 |
| KDS        | read-provisioned  | Consumerの読み取り量がシャード規定を上回る<br/>主に複数Consumer構成のケースで発生 | write-provisionedと同じ                                                  |
| KDS        | iterator-age      | Producerの送信量 > Consumerの処理量で処理遅延発生                  | Consumerの処理能力を上げるなど<br/>対応手順のリンクを貼る                                   |
| APIGW      | client-error      | APIGWで4××エラーが一定数を超える<br/>不正なアクセスによる403エラーなど         | 対応手順のリンクを貼る                                                           |
| APIGW      | server-error      | APIGWで5××エラーが一定数を超える<br/>APIGWとKDSの統合エラーやネットワーク遮断など | 基本的にこちらでの対応は不可<br/>未処理レコードが発生していないか確認するなど                             |
| Lambda     | errors            | Lambda関数でのエラーが一定数を超える<br/>業務処理の失敗、メモリ不足など           | 対応手順のリンクを貼る                                                           |
| Lambda-SQS | dlq-messages-sent | Lambdaでの最大リトライを超える処理失敗により、<br/>未処理レコード発生            | Messageを確認して手動で処理を再実行するなど<br/>対応手順のリンクを貼る                             |
| Firehose   | partition-count   | 動的パーティショニング使用時にパーティション数が上限値を超える                     | パーティション作成の実装見直しなど                                                     |
| Firehose   | s3-data-freshness | S3配信時に一定以上の配信処理遅延が発生                                | 対応手順のリンクを貼る                                                           |
| Firehose   | lambda-errors     | Firehose連携のLambda関数で一定以上のエラー発生                      | 関数の実装見直しなど                                                            |
`
