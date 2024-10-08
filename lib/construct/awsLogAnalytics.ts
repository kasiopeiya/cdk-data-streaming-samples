import { Construct } from 'constructs'
import { RemovalPolicy, Stack } from 'aws-cdk-lib'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import * as glue from 'aws-cdk-lib/aws-glue'
import * as athena from 'aws-cdk-lib/aws-athena'

export interface CloudTrailLogAnalyticsProps {
  /** CloudTrailのログが保存されているS3 Bucket */
  dataBucket: Bucket
}

/**
 * Kinesis Data StreamsのCloudTrailデータイベント証跡を作成する
 */
export class CloudTrailLogAnalytics extends Construct {
  constructor(scope: Construct, id: string, props: CloudTrailLogAnalyticsProps) {
    super(scope, id)

    const accountId = Stack.of(this).account

    /*
    * Glue
    -------------------------------------------------------------------------- */
    const dataBaseName = 'cloudtrail_logs_database'
    const tableName = 'cloudtrail_logs_table'

    // データカタログ
    const dataBase = new glue.CfnDatabase(this, 'Database', {
      catalogId: accountId,
      databaseInput: {
        name: dataBaseName
      }
    })

    // テーブル
    const cloudTailLogsTable = new glue.CfnTable(this, 'Resource', {
      databaseName: dataBaseName,
      catalogId: accountId,
      tableInput: {
        name: tableName,
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          'projection.enabled': 'true',
          'projection.region.type': 'enum',
          'projection.region.values':
            'us-east-1,us-east-2,us-west-1,us-west-2,af-south-1,ap-east-1,ap-south-1,ap-northeast-2,ap-southeast-1,ap-southeast-2,ap-northeast-1,ca-central-1,eu-central-1,eu-west-1,eu-west-2,eu-south-1,eu-west-3,eu-north-1,me-south-1,sa-east-1',
          'projection.date.type': 'date',
          'projection.date.range': 'NOW-1YEARS,NOW+9HOUR',
          'projection.date.format': 'yyyy/MM/dd',
          'projection.date.interval': '1',
          'projection.date.interval.unit': 'DAYS',
          'storage.location.template':
            `s3://${props.dataBucket.bucketName}/AWSLogs/${accountId}/` +
            'CloudTrail/${region}/${date}',
          classification: 'cloudtrail',
          compressionType: 'gzip',
          typeOfData: 'file'
        },
        storageDescriptor: {
          columns: [
            {
              name: 'eventVersion',
              type: 'string'
            },
            {
              name: 'useridentity',
              type: 'struct<type:string,principalId:string,arn:string,accountId:string,invokedBy:string,accessKeyId:string,userName:string,sessionContext:struct<attributes:struct<mfaAuthenticated:string,creationDate:string>,sessionIssuer:struct<type:string,principalId:string,arn:string,accountId:string,userName:string>>>'
            },
            {
              name: 'eventTime',
              type: 'string'
            },
            {
              name: 'eventSource',
              type: 'string'
            },
            {
              name: 'eventName',
              type: 'string'
            },
            {
              name: 'awsRegion',
              type: 'string'
            },
            {
              name: 'sourceIpAddress',
              type: 'string'
            },
            {
              name: 'userAgent',
              type: 'string'
            },
            {
              name: 'errorCode',
              type: 'string'
            },
            {
              name: 'errorMessage',
              type: 'string'
            },
            {
              name: 'requestParameters',
              type: 'string'
            },
            {
              name: 'responseElements',
              type: 'string'
            },
            {
              name: 'additionalEventData',
              type: 'string'
            },
            {
              name: 'requestId',
              type: 'string'
            },
            {
              name: 'eventId',
              type: 'string'
            },
            {
              name: 'resources',
              type: 'array<struct<arn:string,accountId:string,type:string>>'
            },
            {
              name: 'eventType',
              type: 'string'
            },
            {
              name: 'apiVersion',
              type: 'string'
            },
            {
              name: 'readOnly',
              type: 'string'
            },
            {
              name: 'recipientAccountId',
              type: 'string'
            },
            {
              name: 'serviceEventDetails',
              type: 'string'
            },
            {
              name: 'sharedEventID',
              type: 'string'
            },
            {
              name: 'vpcEndpointId',
              type: 'string'
            }
          ],
          inputFormat: 'com.amazon.emr.cloudtrail.CloudTrailInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: {
            serializationLibrary: 'com.amazon.emr.hive.serde.CloudTrailSerde',
            parameters: {
              'serialization.format': '1'
            }
          },
          location: `s3://${props.dataBucket.bucketName}/AWSLogs/${accountId}/CloudTrail/`
        },
        partitionKeys: [
          {
            name: 'region',
            type: 'string'
          },
          {
            name: 'date',
            type: 'string'
          }
        ]
      }
    })
    cloudTailLogsTable.addDependency(dataBase)

    /*
    * Athena
    -------------------------------------------------------------------------- */
    // クエリ結果格納バケット
    const athenaResultBucket = new Bucket(this, 'Bucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true
    })

    // ワークグループ
    const workGroup = new athena.CfnWorkGroup(this, 'WorkGroup', {
      name: `${Stack.of(this).stackName}-wg`,
      workGroupConfiguration: {
        engineVersion: {
          selectedEngineVersion: 'Athena engine version 3'
        },
        resultConfiguration: {
          outputLocation: `s3://${athenaResultBucket.bucketName}/result`
        },
        bytesScannedCutoffPerQuery: 100000000
      },
      recursiveDeleteOption: true
    })

    // Saved Query
    const querySelectAll = new athena.CfnNamedQuery(this, 'QuerySelectAll', {
      database: dataBaseName,
      queryString: `select * from ${dataBaseName}.${tableName} limit 50;`,
      name: 'SelectAll',
      workGroup: workGroup.name
    })
    querySelectAll.addDependency(workGroup)

    const querySelectPutRecords = new athena.CfnNamedQuery(this, 'QuerySelectPutRecords', {
      database: dataBaseName,
      queryString: `select * from ${dataBaseName}.${tableName} where eventname = 'PutRecords' limit 50;`,
      name: 'SelectPutRecords',
      workGroup: workGroup.name
    })
    querySelectPutRecords.addDependency(workGroup)

    const querySelectFromApiGw = new athena.CfnNamedQuery(this, 'QuerySelectFromApiGw', {
      database: dataBaseName,
      queryString: `select * from ${dataBaseName}.${tableName} where eventname = 'PutRecords' and sourceipaddress = 'apigateway.amazonaws.com' limit 50;`,
      name: 'SelectPutRecords',
      workGroup: workGroup.name
    })
    querySelectFromApiGw.addDependency(workGroup)
  }
}
