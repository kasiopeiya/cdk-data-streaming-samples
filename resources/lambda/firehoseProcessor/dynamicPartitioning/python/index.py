'''動的パーティショニング処理用Lambda関数'''

import base64
import json
import datetime

def lambda_handler(firehose_records_input, context):
  print(firehose_records_input)

  firehose_records_output = {'records': []}

  for firehose_record in firehose_records_input['records']:
    decoded_data = base64.b64decode(firehose_record['data']).decode('utf-8')
    print(f'data: {decoded_data}')

    record_data = json.loads(decoded_data)

    # 動的パーティショニングのプレフィックス
    data_type: str = record_data['dataType']
    event_timestamp = datetime.datetime.fromtimestamp(float(firehose_record['approximateArrivalTimestamp']/1000))
    partition_keys = {
      "dataType": data_type,
      "year": event_timestamp.strftime('%Y'),
      "month": event_timestamp.strftime('%m'),
      "date": event_timestamp.strftime('%d'),
    }
    print(partition_keys)

    firehose_records_output["records"].append(
      {
        "recordId": firehose_record['recordId'],
        "data": firehose_record['data'],
        "result": "Ok",
        "metadata": { 'partitionKeys': partition_keys }
      }
    )

  return firehose_records_output
