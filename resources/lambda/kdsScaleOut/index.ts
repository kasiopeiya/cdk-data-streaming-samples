import {
  KinesisClient,
  DescribeStreamSummaryCommand,
  UpdateShardCountCommand,
  ScalingType
} from '@aws-sdk/client-kinesis'
import * as winston from 'winston'

const region = process.env.AWS_DEFAULT_REGION
const kinesisClient = new KinesisClient({ region })

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.cli(),
    winston.format.printf((info) => `[${info.timestamp}] ${info.level} ${info.message}`)
  ),
  transports: [new winston.transports.Console()]
})

/**
 * ハンドラー関数
 * @param event
 */
export const handler = async () => {
  if (process.env.DATA_STREAM_NAME === undefined) {
    throw new Error('Required environmental variable is not defined')
  }
  const dataStreamName: string = process.env.DATA_STREAM_NAME

  // シャード数情報を取得
  const currentShardCount = await getOpenShardCount(dataStreamName)

  // スケールアウト
  const targetShardCount = currentShardCount * 2
  logger.info(`currentShardCount: ${currentShardCount}, targetShardCount: ${targetShardCount}`)
  try {
    await scaleOutDataStream(dataStreamName, targetShardCount)
    logger.info('Successfully scale out data stream:', dataStreamName, targetShardCount)
  } catch (error) {
    logger.error('Failed to scale out', error)
  }
}

/**
 * データストリームのシャード数を取得する
 * @param dataStreamName
 * @returns
 */
async function getOpenShardCount(dataStreamName: string): Promise<number> {
  const command = new DescribeStreamSummaryCommand({ StreamName: dataStreamName })
  const response = await kinesisClient.send(command)
  if (response.StreamDescriptionSummary?.OpenShardCount === undefined) {
    throw new Error('failed to DescribeStreamSummaryCommand')
  }
  return response.StreamDescriptionSummary.OpenShardCount
}

/**
 * KDS DataStreamのシャード数をスケールアウトする
 * @param dataStreamName
 * @param targetShardCount
 */
async function scaleOutDataStream(dataStreamName: string, targetShardCount: number): Promise<void> {
  const command = new UpdateShardCountCommand({
    StreamName: dataStreamName,
    TargetShardCount: targetShardCount,
    ScalingType: ScalingType.UNIFORM_SCALING
  })
  await kinesisClient.send(command)
}
