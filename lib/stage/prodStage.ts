/** 本番環境用ステージ */
import { Stack, type StageProps, type IAspect, Aspects, type Environment } from 'aws-cdk-lib'
import { type IConstruct, type Construct } from 'constructs'

import { prodConfig, type Config } from '../../config'
import { StageBase } from './stageBase'

export class ProdStage extends StageBase {
  public readonly stacks: Record<string, Stack>
  constructor(scope: Construct, id: string, props: StageProps) {
    super(scope, id, props)
    const env: Environment = props.env ?? prodConfig.env
    const config: Config = prodConfig
    this.stacks = this.createStacks(config, env)

    // スタックの削除保護
    for (const stack of Object.values(this.stacks)) {
      Aspects.of(stack).add(new AddTerminationProtection())
    }
  }

  createStacks(config: Config, env: Environment): Record<string, Stack> {
    return {
      ...super.createCommonStacks(this, config, env)
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
