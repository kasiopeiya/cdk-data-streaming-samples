/** 開発環境用ステージ */
import { type Construct } from 'constructs'
import { type Stack, type StageProps, type Environment } from 'aws-cdk-lib'

import { devConfig, type Config } from '../../config'
import { StageBase } from './stageBase'

export class DevStage extends StageBase {
  public readonly stacks: Record<string, Stack>
  constructor(scope: Construct, id: string, props: StageProps) {
    super(scope, id, props)
    const env: Environment = props.env ?? devConfig.env
    const config: Config = devConfig
    this.stacks = this.createStacks(config, env)
  }

  createStacks(config: Config, env: Environment): Record<string, Stack> {
    return {
      ...super.createCommonStacks(this, config, env)
    }
  }
}
