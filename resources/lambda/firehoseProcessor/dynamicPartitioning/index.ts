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

interface Record_ {
  recordId: string
  approximateArrivalTimestamp: number
  data: string
  kinesisRecordMetadata: {
    sequenceNumber: string
    subsequenceNumber: number
    partitionKey: string
    shardId: string
    approximateArrivalTimestamp: number
  }
}

interface Event {
  invocationId: string
  sourceKinesisStreamArn: string
  deliveryStreamArn: string
  region: string
  records: Record_[]
}

interface OutputRecord {
  recordId: string
  data: string
  result: string
  metadata: {
    partitionKeys: {
      dataType: string
      year: string
      month: string
      date: string
    }
  }
}

interface RecordDataSchema {
  recordId: string
  requestId: string
  systemId: string
  timeStamp: string
  notificationFlag: '0' | '1'
  email: string
  dataType: 'free' | 'normal' | 'premium'
  extraData: string
}

export default async (event: Event): Promise<{ records: OutputRecord[] }> => {
  logger.info(`num of records: ${event.records.length}`)

  const outputRecords: OutputRecord[] = []

  for (const firehoseRecord of event.records) {
    const decodedData = Buffer.from(firehoseRecord.data, 'base64').toString('utf-8')
    const recordData: RecordDataSchema = JSON.parse(decodedData)

    // 動的パーティショニングのプレフィックス
    const dataType: string = recordData.dataType
    const eventTimeStamp = new Date(firehoseRecord.approximateArrivalTimestamp)
    const partitionKey = {
      dataType,
      year: eventTimeStamp.getFullYear().toString(),
      month: eventTimeStamp.getMonth().toString(),
      date: eventTimeStamp.getDay().toString()
    }

    outputRecords.push({
      recordId: firehoseRecord.recordId,
      data: firehoseRecord.data,
      result: 'OK',
      metadata: {
        partitionKeys: partitionKey
      }
    })
  }

  return {
    records: outputRecords
  }
}
