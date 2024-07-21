import { type Stack, type StageProps } from 'aws-cdk-lib'
import { type Construct } from 'constructs'

import { devConfig } from '../../config'
import { StageBase } from './stageBase'

export class DevStage extends StageBase {
  public readonly stacks: Record<string, Stack>
  constructor(scope: Construct, id: string, props: StageProps) {
    super(scope, id, props)
    this.stacks = this.createStacks()
  }

  createStacks(): Record<string, Stack> {
    // 各環境にのみデプロイするスタックを生成
    // const hogeStack = new HogeStack(this, 'HogeStack')
    return {
      ...super.createCommonStacks(this, devConfig)
      // hogeStack
    }
  }
}
