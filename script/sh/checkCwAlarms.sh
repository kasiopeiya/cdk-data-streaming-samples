#!/bin/bash

######################################################################################
# CloudWatch Alarmのステータスを確認するシェルスクリプト
# tagをもとに確認対象アラームを選定
######################################################################################

# チェック対象のファイル名
tagKey=$1
tagValue=$2

tagged_alarms_arn=$(aws resourcegroupstaggingapi get-resources \
    --tag-filters Key=$tagKey,Values=$tagValue \
    --resource-type-filters "cloudwatch:alarm" \
    --query "ResourceTagMappingList[*].ResourceARN" \
    --output json | jq -r 'join(" ")')

successFlg=true
for arn in $tagged_alarms_arn; do
    alarmState=$(aws cloudwatch describe-alarms --query "MetricAlarms[?AlarmArn=='$arn'].StateValue | [0]")
    echo "State $alarmState Alarm: $arn"
    if [ $alarmState == "ALARM" ]; then
      echo "in alarm"
      successFlg=false
    fi
done

if ! "$successFlg"; then
    echo "check cloudwatch alarm status failed"
    echo failed > result.txt
fi
