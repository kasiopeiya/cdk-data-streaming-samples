import { Construct } from 'constructs'
import { type ITopic } from 'aws-cdk-lib/aws-sns'
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'

interface AlarmNotificationHandlerProps {
  /** メール通知に使用するSNS Topic */
  topic: ITopic
  /** メール件名のプレフィックス */
  emailSubjectPrefix?: string
}

/**
 * EventBridgeトリガーでCloudWatch Alarmのstatus変更を検知
 * Input TransformerとStep Functionで件名と本文を加工
 */
export class AlarmNotificationHandler extends Construct {
  constructor(scope: Construct, id: string, props: AlarmNotificationHandlerProps) {
    super(scope, id)

    /*
    * Step Functions
    -------------------------------------------------------------------------- */
    // SNS通知タスク定義
    const snsPublishTask = new tasks.CallAwsService(this, 'snsPublishTask', {
      service: 'sns',
      action: 'publish',
      parameters: {
        TopicArn: props.topic.topicArn,
        'Message.$': '$.message',
        'Subject.$': '$.subject'
      },
      iamResources: [props.topic.topicArn]
    })

    const stateMachine = new sfn.StateMachine(this, 'Resource', {
      definitionBody: sfn.DefinitionBody.fromChainable(snsPublishTask)
    })

    /*
    *  Event Bridge
    -------------------------------------------------------------------------- */
    const rule = new events.Rule(this, 'Rule', {
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
        detail: { state: { value: ['ALARM'] }, alarmName: [{ suffix: 'info' }] }
      }
    })

    // input transformerでメールの件名と本文を加工
    props.emailSubjectPrefix ??= '【CDK Streamingサンプルアラーム通知】'
    rule.addTarget(
      new targets.SfnStateMachine(stateMachine, {
        input: events.RuleTargetInput.fromObject({
          subject: `${props.emailSubjectPrefix} ${events.EventField.fromPath('$.detail.alarmName')}`,
          message: events.EventField.fromPath('$.detail')
        })
      })
    )
  }
}
