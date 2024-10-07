import { RecordDataGenerator } from './recordDataGenerator'

/**
 * 外部から注入されたRecordDataGeneratorインスタンスを実行し、レコードを生成する
 */
export class RecordDataFactory {
  constructor(private recordGenerator: RecordDataGenerator) {}
  generateRecord(
    recordSize: number,
    requestId: string
  ): ReturnType<typeof this.recordGenerator.generateRecord> {
    return this.recordGenerator.generateRecord(recordSize, requestId)
  }
  validate(recordData: object): void {
    this.recordGenerator.validate(recordData)
  }
}
