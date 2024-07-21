import { App } from 'aws-cdk-lib'
import { type Template } from 'aws-cdk-lib/assertions'

import { devConfig } from '../../config'
import { DevStage } from '../../lib/stage/devStage'
import { createTemplates } from '../testHelper'

const app = new App()
const stage = new DevStage(app, 'dev', {
  env: devConfig.env
})
const templates: Record<string, Template> = createTemplates(stage.stacks)

for (const key in templates) {
  test(key, () => {
    expect(templates[key].toJSON()).toMatchSnapshot()
  })
}
