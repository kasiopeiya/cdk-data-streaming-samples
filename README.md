# CDK ストリーミングサンプル

Data Streaming系サービスのCDKコードサンプルです。

## 前提

- VSCode, Docker, docker-composeが利用可能であること

## CDK開発環境構築

> DevContainerを使用

- VSCodeの拡張機能Remote Explorerをインストール
- cdk-data-streaming-samplesのトップディレクトリで"Open Folder in Container"

## Producer Script実行環境構築

### 実行手順

```bash
# コンテナ起動
cd script
docker compose up script -d
# コンテナ内部に入る
docker compose exec script /bin/bash
# スクリプトの確認
cd workspace
ls
```

任意のスクリプトを実行する

```bash
# 設定ファイルの編集
vi apiGwPutRecordsConfig.ts
# 実行
npx ts-node apiGwPutRecords.ts
```

### CodeBuildでスクリプト実行

| 環境変数    | 説明                 | 利用可能な値                                                                      |
| ----------- | -------------------- | --------------------------------------------------------------------------------- |
| SCRIPT_NAME | 実行するスクリプト名 | apiGwPutRecord, apiGwPutRecords, sdkPutRecords                                    |
| STACK_NAME  | 実行対象のスタック名 | dev-data-str-sample-apigw-kds-lambda-stack, dev-data-str-sample-delivery-s3-stack |

CLIコマンド例

```bash
aws codebuild start-build \
    --project-name dev-data-str-base-stack-project \
    --environment-variables-override '[
        {
            "name": "SCRIPT_NAME",
            "value": "apiGwPutRecords",
            "type": "PLAINTEXT"
        },
        {
            "name": "STACK_NAME",
            "value": "dev-data-str-sample-apigw-kds-lambda-stack",
            "type": "PLAINTEXT"
        }
    ]'
```

### （参考）composeを使わずにdockerのみで構築する場合

```bash
cd script
docker image build ./ -t script
docker container run -it --name script script bash -v $(pwd):/workspace
```
