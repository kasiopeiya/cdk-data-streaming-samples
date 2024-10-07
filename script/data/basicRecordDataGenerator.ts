import { z } from 'zod'
import { faker } from '@faker-js/faker'

import { requiredRecordSchema } from './requiredRecordSchema'
import { RecordDataGenerator } from './recordDataGenerator'

const basicRecordDataSchema = requiredRecordSchema.extend({ extraData: z.string().optional() })

/**
 * シンプルなレコードデータを生成するGenerator
 */
export class BasicRecordDataGenerator implements RecordDataGenerator {
  public recordDataSchema: typeof basicRecordDataSchema
  constructor() {
    this.recordDataSchema = basicRecordDataSchema
  }
  generateRecord(recordSize: number, requestId: string): z.infer<typeof this.recordDataSchema> {
    const recordData: z.infer<typeof this.recordDataSchema> = {
      recordId: faker.string.alphanumeric(10),
      requestId,
      systemId: 'A00000000001',
      timeStamp: Date.now().toString(),
      notificationFlag: faker.helpers.arrayElement(['0', '1']),
      email: faker.internet.email(),
      dataType: faker.helpers.arrayElement(['free', 'normal', 'premium'])
    }

    // 最小レコードサイズチェック
    const recordDataSize: number = JSON.stringify(recordData).length
    if (recordSize < recordDataSize) {
      throw new Error(`recordSize must be greater than ${recordDataSize}`)
    }

    // レコードサイズ調整のためのextraDataを設定
    const extraDataSize = recordSize - recordDataSize
    if (extraDataSize > 0) recordData.extraData = faker.string.alpha(extraDataSize)

    return recordData
  }
  validate(recordData: object): void {
    this.recordDataSchema.parse(recordData)
  }
}
