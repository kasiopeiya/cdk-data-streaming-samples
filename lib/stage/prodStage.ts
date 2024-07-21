import { Stack, type StageProps, type IAspect, Aspects } from 'aws-cdk-lib'
import { type IConstruct, type Construct } from 'constructs'

import { prodConfig } from '../../config'
import { StageBase } from './stageBase'

export class ProdStage extends StageBase {
  public readonly stacks: Record<string, Stack>
  constructor(scope: Construct, id: string, props: StageProps) {
    super(scope, id, props)
    this.stacks = this.createStacks()

    // スタックの削除保護
    for (const stack of Object.values(this.stacks)) {
      Aspects.of(stack).add(new AddTerminationProtection())
    }
  }

  createStacks(): Record<string, Stack> {
    // 各環境にのみデプロイするスタックを生成
    // const hogeStack = new HogeStack(this, 'HogeStack')
    return {
      ...super.createCommonStacks(this, prodConfig)
      // hogeStack
    }
  }
}

/**
 * スタックの削除保護を有効化するアスペクト
 */
class AddTerminationProtection implements IAspect {
  public visit(node: IConstruct): void {
    // スタックの場合のみ termination protection を設定
    if (Stack.isStack(node)) {
      node.terminationProtection = true
    }
  }
}
