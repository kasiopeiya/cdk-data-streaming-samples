import { z, type ZodObject, type ZodRawShape } from 'zod'

export interface RecordDataGenerator {
  recordDataSchema: ZodObject<ZodRawShape>
  generateRecord(recordSize: number, requestId: string): z.infer<typeof this.recordDataSchema>
  validate(recordData: object): void
}
