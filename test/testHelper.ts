import { type Stack } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'

/**
 * スタックのセットからテスト用のテンプレートセットを生成する
 * @param stacks
 * @returns
 */
export function createTemplates(stacks: Record<string, Stack>): Record<string, Template> {
  const templates: Record<string, Template> = {}
  for (const key in stacks) {
    if (Object.prototype.hasOwnProperty.call(stacks, key)) {
      templates[key] = Template.fromStack(stacks[key])
    }
  }
  return templates
}
