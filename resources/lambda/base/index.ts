import * as winston from 'winston'

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
export const lambdaHandler = async (event: unknown): Promise<any> => {
  logger.info('関数実行しました')
  logger.info(event)
}
