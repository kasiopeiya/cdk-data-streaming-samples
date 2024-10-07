import { z } from 'zod'

/**
 * レコードデータに含めるべき必須プロパティのzodスキーマオブジェクト
 */
export const requiredRecordSchema = z.object({
  recordId: z.string().length(10),
  requestId: z.string().length(20),
  systemId: z.string().length(12),
  timeStamp: z.string().length(13),
  notificationFlag: z.enum(['0', '1']),
  email: z.string(),
  dataType: z.enum(['free', 'normal', 'premium'])
})
