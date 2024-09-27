import { Construct } from 'constructs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as rg from 'aws-cdk-lib/aws-resourcegroups'

export interface Ec2AutoStartStopProps {
  /** 起動のスケジュール (cron形式) */
  startSchedule: string
  /** 停止のスケジュール (cron形式) */
  stopSchedule: string
}

export class Ec2AutoStartStopConstruct extends Construct {
  constructor(scope: Construct, id: string, props: Ec2AutoStartStopProps) {
    super(scope, id)

    // Resource Group for instances with AutoStart tag
    const autoStartResourceGroup = new rg.CfnGroup(this, 'AutoStartRG', {
      name: 'AutoStartInstances',
      resourceQuery: {
        query: {
          resourceTypeFilters: ['AWS::EC2::Instance'],
          tagFilters: [
            {
              key: 'AutoStart',
              values: ['true']
            }
          ]
        }
      }
    })

    // Resource Group for instances with AutoStop tag
    const autoStopResourceGroup = new rg.CfnGroup(this, 'AutoStopRG', {
      name: 'AutoStopInstances',
      resourceQuery: {
        query: {
          resourceTypeFilters: ['AWS::EC2::Instance'],
          tagFilters: [
            {
              key: 'AutoStop',
              values: ['true']
            }
          ]
        }
      }
    })

    // Maintenance Window for starting EC2 instances
    const maintenanceWindowStart = new ssm.CfnMaintenanceWindow(this, 'MaintenanceWindowStart', {
      name: 'AutoStartWindow',
      schedule: props.startSchedule,
      duration: 1,
      cutoff: 0,
      allowUnassociatedTargets: false
    })

    // Maintenance Window for stopping EC2 instances
    const maintenanceWindowStop = new ssm.CfnMaintenanceWindow(this, 'MaintenanceWindowStop', {
      name: 'AutoStopWindow',
      schedule: props.stopSchedule,
      duration: 1,
      cutoff: 0,
      allowUnassociatedTargets: false
    })

    // Target the Resource Group in the Maintenance Window for starting instances
    new ssm.CfnMaintenanceWindowTarget(this, 'StartWindowTarget', {
      windowId: maintenanceWindowStart.ref,
      resourceType: 'RESOURCE_GROUP',
      targets: [
        {
          key: 'resource-groups:Name',
          values: [autoStartResourceGroup.ref]
        }
      ]
    })

    // Target the Resource Group in the Maintenance Window for stopping instances
    new ssm.CfnMaintenanceWindowTarget(this, 'StopWindowTarget', {
      windowId: maintenanceWindowStop.ref,
      resourceType: 'RESOURCE_GROUP',
      targets: [
        {
          key: 'resource-groups:Name',
          values: [autoStopResourceGroup.ref]
        }
      ]
    })
  }
}
