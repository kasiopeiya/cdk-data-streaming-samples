import { type Environment } from 'aws-cdk-lib'

export interface Config {
    env: Environment
    prefix: string
}

export const devConfig: Config = {
    env: {
        account: process.env.DEV_ACCOUNT_ID,
        region: 'ap-northeast-1'
    },
    prefix: 'data-str'
}

export const prodConfig: Config = {
    env: {
        account: process.env.PROD_ACCOUNT_ID,
        region: 'ap-northeast-1'
    },
    prefix: 'data-str'
}
