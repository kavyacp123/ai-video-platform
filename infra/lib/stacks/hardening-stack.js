import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { BaseStack } from "../base-stack.js";

export class HardeningStack extends BaseStack {
  constructor(scope, id, props) {
    super(scope, id, props);

    this.platformKey =
      props.platformKey ||
      new kms.Key(this, "PlatformKey", {
        description: "Video platform encryption key",
        enableKeyRotation: true,
        removalPolicy: RemovalPolicy.RETAIN
      });

    this.alertTopic = new sns.Topic(this, "VideoPlatformAlerts", {
      topicName: "video-platform-alerts"
    });

    if (process.env.ALERT_EMAIL) {
      this.alertTopic.addSubscription(new subscriptions.EmailSubscription(process.env.ALERT_EMAIL));
    }

    this.webAcl = new wafv2.CfnWebACL(this, "VideoPlatformWebAcl", {
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "VideoPlatformWebAcl",
        sampledRequestsEnabled: true
      },
      rules: [
        {
          name: "RateLimitPerIp",
          priority: 1,
          action: { block: {} },
          statement: { rateBasedStatement: { limit: 300, aggregateKeyType: "IP" } },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "RateLimitPerIp",
            sampledRequestsEnabled: true
          }
        },
        {
          name: "CommonRuleSet",
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
              ruleActionOverrides: [{ name: "SizeRestrictions_BODY", actionToUse: { count: {} } }]
            }
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "CommonRuleSet",
            sampledRequestsEnabled: true
          }
        },
        {
          name: "SqlInjectionRuleSet",
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: { vendorName: "AWS", name: "AWSManagedRulesSQLiRuleSet" }
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "SqlInjectionRuleSet",
            sampledRequestsEnabled: true
          }
        }
      ]
    });

    if (props.httpApi) {
      new wafv2.CfnWebACLAssociation(this, "WafAssociation", {
        resourceArn: `arn:aws:apigateway:${this.region}::/apis/${props.httpApi.apiId}/stages/$default`,
        webAclArn: this.webAcl.attrArn
      });
    }

    const alarmAction = new actions.SnsAction(this.alertTopic);

    if (props.stateMachine) {
      new cloudwatch.Alarm(this, "StepFunctionsFailuresAlarm", {
        metric: props.stateMachine.metricFailed({ period: Duration.minutes(5) }),
        threshold: 3,
        evaluationPeriods: 1
      }).addAlarmAction(alarmAction);
    }

    if (props.agentDlq) {
      new cloudwatch.Alarm(this, "DlqNotEmptyAlarm", {
        metric: props.agentDlq.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1
      }).addAlarmAction(alarmAction);
    }

    for (const fn of props.criticalFunctions || []) {
      new cloudwatch.Alarm(this, `${fn.node.id}ErrorsAlarm`, {
        metric: fn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 5,
        evaluationPeriods: 1
      }).addAlarmAction(alarmAction);
    }

    new CfnOutput(this, "AlertTopicArn", { value: this.alertTopic.topicArn });
    new CfnOutput(this, "PlatformKeyArn", { value: this.platformKey.keyArn });
  }
}
