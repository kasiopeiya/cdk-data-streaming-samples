import { App } from 'aws-cdk-lib'
import { type Template } from 'aws-cdk-lib/assertions'

import { prodConfig } from '../../config'
import { ProdStage } from '../../lib/stage/prodStage'
import { createTemplates } from '../testHelper'

const app = new App()
const stage = new ProdStage(app, 'prod', {
  env: prodConfig.env
})
const templates: Record<string, Template> = createTemplates(stage.stacks)

for (const key in templates) {
  test(key, () => {
    expect(templates[key].toJSON()).toMatchSnapshot()
  })
}
