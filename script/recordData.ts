import { z } from 'zod'
import { faker } from '@faker-js/faker'

// サンプルレコードデータのスキーマ
export const recordDataSchema = z.object({
  recordId: z.string().length(10),
  requestId: z.string().length(20),
  systemId: z.string().length(12),
  timeStamp: z.string().length(13),
  notificationFlag: z.enum(['0', '1']),
  email: z.string(),
  dataType: z.enum(['free', 'normal', 'premium']),
  extraData: z.string().optional()
})
export type RecordData = z.infer<typeof recordDataSchema>

/**
 * サンプルレコードデータ生成
 * @param recordSize 生成したいレコードのサイズ
 * @param requestId リクエストを識別するためのID
 * @returns
 */
export function generateSampleRecord(recordSize: number, requestId: string): RecordData {
  const recordData: RecordData = {
    recordId: faker.string.alphanumeric(10),
    requestId,
    systemId: 'A00000000001',
    timeStamp: Date.now().toString(),
    notificationFlag: faker.helpers.arrayElement(['0', '1']),
    email: faker.internet.email(),
    dataType: faker.helpers.arrayElement(['free', 'normal', 'premium'])
  }
  const recordDataSize: number = JSON.stringify(recordData).length

  // 最小レコードサイズチェック
  if (recordSize < recordDataSize) {
    throw new Error(`recordSize must be greater than ${recordDataSize}`)
  }

  // レコードサイズ調整のためのextraDataを設定
  const extraDataSize = recordSize - recordDataSize
  if (extraDataSize > 0) recordData.extraData = faker.string.alpha(extraDataSize)

  // zodによる型検証
  recordDataSchema.parse(recordData)

  return recordData
}
