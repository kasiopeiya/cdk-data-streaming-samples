#!/bin/bash

######################################################################################
# Producerスクリプトログを見て成功失敗を判断するシェルスクリプト
######################################################################################

# チェック対象のファイル名
log_file_name=$1

SUCCESS_COUNT=$(grep -c "SUCCESS" $log_file_name || echo 0)
WARNING_COUNT=$(grep -c "WARNING" $log_file_name || echo 0)
RETRY_COUNT=$(grep -c "RETRY" $log_file_name || echo 0)
ERROR_COUNT=$(grep -c "ERROR" $log_file_name || echo 0)
echo "SUCCESS=$SUCCESS_COUNT WARNING=$WARNING_COUNT RETRY=$RETRY_COUNT ERROR=$ERROR_COUNT"

if [ $ERROR_COUNT -gt 0 ] || [ $SUCCESS_COUNT -eq 0 ]; then
  echo check script log failed
  echo failed > result.txt
fi
