import { type Construct } from 'constructs'
import { Stack, type StackProps, CfnOutput, Tags } from 'aws-cdk-lib'
import { aws_ec2 as ec2 } from 'aws-cdk-lib'

/**
 * VPC, Subnet(Public✖️1, Private✖️1), NatGatewayを構築する
 */
export class SampleVpcStack extends Stack {
  public readonly vpc: ec2.IVpc

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    Tags.of(this).add('StackName', this.stackName)

    /*
    * VPC
    -------------------------------------------------------------------------- */
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: 'data-str-test-vpc',
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 24,
          name: 'private-with-egress',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        }
      ],
      natGateways: 1,
      natGatewayProvider: ec2.NatGatewayProvider.gateway()
    })

    /*
    * 出力
    -------------------------------------------------------------------------- */
    new CfnOutput(this, 'VpcId', { value: this.vpc.vpcId, exportName: 'vpcId' })
    new CfnOutput(this, 'privateSubnetId', {
      value: this.vpc.privateSubnets[0].subnetId,
      exportName: 'privateSubnetId'
    })
  }
}
