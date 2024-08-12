import { App, type Environment } from 'aws-cdk-lib'
import { type Template } from 'aws-cdk-lib/assertions'

import { ProdStage } from '../../lib/stage/prodStage'
import { createTemplates } from '../testHelper'

const app = new App()
const env: Environment = { account: undefined, region: 'ap-northeast-1' }
const stage = new ProdStage(app, 'prod', { env })
const templates: Record<string, Template> = createTemplates(stage.stacks)

for (const key in templates) {
  test(key, () => {
    expect(templates[key].toJSON()).toMatchSnapshot()
  })
}
