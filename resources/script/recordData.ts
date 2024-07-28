import { z } from 'zod'
// import { faker } from '@faker-js/faker'

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
