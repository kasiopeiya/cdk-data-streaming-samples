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

### （参考）composeを使わずにdockerのみで構築する場合

```bash
cd script
docker image build ./ -t script
docker container run -it --name script script bash -v $(pwd):/workspace
```
