import { z } from 'zod'
import { faker } from '@faker-js/faker'

interface RecordDataGenerator {
  recordDataSchema: object
  generateRecord(recordSize: number, requestId: string): object
  validate(recordData: object): void
}

class RecordDataFactory {
  constructor(private recordGenerator: RecordDataGenerator) {}
  generateRecord(recordSize: number, requestId: string) {
    return this.recordGenerator.generateRecord(recordSize, requestId)
  }
  validate(recordData: object): void {
    this.recordGenerator.validate(recordData)
  }
}

// サンプルレコードデータのスキーマ
export const requiredRecordSchema = z.object({
  recordId: z.string().length(10),
  requestId: z.string().length(20),
  systemId: z.string().length(12),
  timeStamp: z.string().length(13),
  notificationFlag: z.enum(['0', '1']),
  email: z.string(),
  dataType: z.enum(['free', 'normal', 'premium']),
  extraData: z.string().optional()
})

class BasicRecordDataGenerator implements RecordDataGenerator {
  public recordDataSchema: typeof requiredRecordSchema
  constructor() {
    this.recordDataSchema = requiredRecordSchema
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

const basicRecordDataGenerator = new BasicRecordDataGenerator()
const recordGenerator = new RecordDataFactory(basicRecordDataGenerator)
const recordData = recordGenerator.generateRecord(11, 'aaa')
recordGenerator.validate(recordData)
