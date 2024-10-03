import { Construct } from 'constructs'
import { Stream, type StreamProps, StreamMode } from 'aws-cdk-lib/aws-kinesis'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import * as cw from 'aws-cdk-lib/aws-cloudwatch'

interface KdsDataStreamProps {
  dataStreamProps?: StreamProps
}

/**
 * Kinesis Data Streamsとその関連リソースを構築するオリジナルconstruct
 */
export class KdsDataStream extends Construct {
  public readonly dataStream: Stream

  constructor(scope: Construct, id: string, props?: KdsDataStreamProps) {
    super(scope, id)

    /*
    * Kinesis Data Streams
    -------------------------------------------------------------------------- */
    this.dataStream = new Stream(this, 'Resource', {
      shardCount: 1,
      streamMode: StreamMode.PROVISIONED,
      removalPolicy: RemovalPolicy.DESTROY,
      ...props?.dataStreamProps
    })

    /*
    *  SSM Parameter Store
    -------------------------------------------------------------------------- */
    // dataStream名を登録
    // producer scriptで利用
    new ssm.StringParameter(this, 'parameter', {
      parameterName: `/${Stack.of(this).stackName}/stream/name`,
      stringValue: this.dataStream.streamName
    })
  }

  /**
   * 書き込みスループット超過エラーのアラームを作成
   * @param metricOption メトリクス設定
   * @param alarmOption  CW Alarm設定
   * @returns
   */
  createWriteProvisionedAlarm(
    metricOption?: cw.MetricOptions,
    alarmOption?: cw.CreateAlarmOptions
  ): cw.Alarm {
    metricOption ??= {
      period: Duration.minutes(1),
      statistic: cw.Stats.SUM
    }
    alarmOption ??= {
      alarmName: `kds-write-provisioned-alarm-${Stack.of(this).stackName}`,
      evaluationPeriods: 5,
      datapointsToAlarm: 5,
      threshold: 500,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING
    }
    const metric = this.dataStream.metricWriteProvisionedThroughputExceeded(metricOption)
    return metric.createAlarm(this, 'writeProvisionedAlarm', alarmOption)
  }

  /**
   * 読み込みスループット超過エラーのアラームを作成
   * @param metricOption メトリクス設定
   * @param alarmOption  CW Alarm設定
   * @returns
   */
  createReadProvisionedAlarm(
    metricOption?: cw.MetricOptions,
    alarmOption?: cw.CreateAlarmOptions
  ): cw.Alarm {
    metricOption ??= {
      period: Duration.minutes(1),
      statistic: cw.Stats.SUM
    }
    alarmOption ??= {
      alarmName: `kds-read-provisioned-alarm-${Stack.of(this).stackName}`,
      evaluationPeriods: 5,
      datapointsToAlarm: 5,
      threshold: 500,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING
    }
    const metric = this.dataStream.metricReadProvisionedThroughputExceeded(metricOption)
    return metric.createAlarm(this, 'readProvisionedAlarm', alarmOption)
  }

  /**
   * データストリーム内での待機時間を示すアラームを作成
   * @param metricOption メトリクス設定
   * @param alarmOption  CW Alarm設定
   * @returns
   */
  createIteratorAgeAlarm(
    metricOption?: cw.MetricOptions,
    alarmOption?: cw.CreateAlarmOptions
  ): cw.Alarm {
    metricOption ??= {
      period: Duration.minutes(1),
      statistic: cw.Stats.SUM
    }
    alarmOption ??= {
      alarmName: `kds-iterator-age-alarm-${Stack.of(this).stackName}`,
      evaluationPeriods: 5,
      datapointsToAlarm: 5,
      threshold: 0,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING
    }
    const metric = this.dataStream.metricGetRecordsIteratorAgeMilliseconds(metricOption)
    return metric.createAlarm(this, 'iteratorAgeAlarm', alarmOption)
  }
}
