/** 本番環境用ステージ */
import { Stack, type StageProps, type IAspect, Aspects } from 'aws-cdk-lib'
import { type IConstruct, type Construct } from 'constructs'

import { prodConfig as config } from '../../config'
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
      ...super.createCommonStacks(this, config)
    }
  }
}

/**
 * スタックの削除保護を有効化するアスペクト
 */
class AddTerminationProtection implements IAspect {
  public visit(node: IConstruct): void {
    // sampleのためfalse(=削除保護無効)
    if (Stack.isStack(node)) {
      node.terminationProtection = false
    }
  }
}
