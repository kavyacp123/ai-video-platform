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

    // Lambda Error Rate Alarms
    for (const fn of props.criticalFunctions || []) {
      new cloudwatch.Alarm(this, `${fn.node.id}ErrorsAlarm`, {
        metric: fn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 5,
        evaluationPeriods: 1,
        alarmDescription: `Critical function ${fn.node.id} error rate exceeded`
      }).addAlarmAction(alarmAction);

      new cloudwatch.Alarm(this, `${fn.node.id}DurationAlarm`, {
        metric: fn.metricDuration({ period: Duration.minutes(5) }),
        threshold: 25000, // 25 seconds - approaching 30s timeout
        evaluationPeriods: 2,
        alarmDescription: `Function ${fn.node.id} running too long`
      }).addAlarmAction(alarmAction);

      new cloudwatch.Alarm(this, `${fn.node.id}ThrottlesAlarm`, {
        metric: fn.metricThrottles({ period: Duration.minutes(1) }),
        threshold: 1,
        evaluationPeriods: 1,
        alarmDescription: `Function ${fn.node.id} throttled - scale up concurrency`
      }).addAlarmAction(alarmAction);
    }

    // Step Functions Alarms
    if (props.stateMachine) {
      new cloudwatch.Alarm(this, "StepFunctionsFailuresAlarm", {
        metric: props.stateMachine.metricFailed({ period: Duration.minutes(5) }),
        threshold: 3,
        evaluationPeriods: 1,
        alarmDescription: "Step Functions pipeline failing"
      }).addAlarmAction(alarmAction);

      new cloudwatch.Alarm(this, "StepFunctionsTimedOutAlarm", {
        metric: props.stateMachine.metricTimedOut({ period: Duration.minutes(5) }),
        threshold: 2,
        evaluationPeriods: 1,
        alarmDescription: "Step Functions executions timing out"
      }).addAlarmAction(alarmAction);
    }

    // DynamoDB Alarms
    if (props.table) {
      new cloudwatch.Alarm(this, "DynamoDBUserErrorsAlarm", {
        metric: new cloudwatch.Metric({
          namespace: "AWS/DynamoDB",
          metricName: "UserErrors",
          dimensions: { TableName: props.table.tableName },
          period: Duration.minutes(1),
          statistic: "Sum"
        }),
        threshold: 10,
        evaluationPeriods: 1,
        alarmDescription: "DynamoDB validation errors detected"
      }).addAlarmAction(alarmAction);

      new cloudwatch.Alarm(this, "DynamoDBReadThrottleAlarm", {
        metric: new cloudwatch.Metric({
          namespace: "AWS/DynamoDB",
          metricName: "ReadThrottleEvents",
          dimensions: { TableName: props.table.tableName },
          period: Duration.minutes(1),
          statistic: "Sum"
        }),
        threshold: 1,
        evaluationPeriods: 2,
        alarmDescription: "DynamoDB read throttling - increase capacity or optimize queries"
      }).addAlarmAction(alarmAction);

      new cloudwatch.Alarm(this, "DynamoDBWriteThrottleAlarm", {
        metric: new cloudwatch.Metric({
          namespace: "AWS/DynamoDB",
          metricName: "WriteThrottleEvents",
          dimensions: { TableName: props.table.tableName },
          period: Duration.minutes(1),
          statistic: "Sum"
        }),
        threshold: 1,
        evaluationPeriods: 2,
        alarmDescription: "DynamoDB write throttling - increase capacity or optimize writes"
      }).addAlarmAction(alarmAction);

      new cloudwatch.Alarm(this, "DynamoDBConsumedWriteCapacityAlarm", {
        metric: new cloudwatch.Metric({
          namespace: "AWS/DynamoDB",
          metricName: "ConsumedWriteCapacityUnits",
          dimensions: { TableName: props.table.tableName },
          period: Duration.minutes(5),
          statistic: "Average"
        }),
        threshold: 80, // Alert if consuming >80% of provisioned capacity
        evaluationPeriods: 2,
        alarmDescription: "DynamoDB consuming high write capacity"
      }).addAlarmAction(alarmAction);
    }

    // SQS Queue Alarms
    if (props.processingQueue) {
      new cloudwatch.Alarm(this, "SQSQueueDepthAlarm", {
        metric: props.processingQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1) }),
        threshold: 100,
        evaluationPeriods: 2,
        alarmDescription: "SQS queue backing up - workers may be slow"
      }).addAlarmAction(alarmAction);

      new cloudwatch.Alarm(this, "SQSLongMessageAgeAlarm", {
        metric: props.processingQueue.metricApproximateAgeOfOldestMessage({ period: Duration.minutes(5) }),
        threshold: 300, // 5 minutes
        evaluationPeriods: 1,
        alarmDescription: "SQS messages waiting too long - check worker health"
      }).addAlarmAction(alarmAction);
    }

    // DLQ Monitoring
    if (props.agentDlq) {
      new cloudwatch.Alarm(this, "DlqNotEmptyAlarm", {
        metric: props.agentDlq.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1,
        alarmDescription: "Messages in DLQ - investigate failures"
      }).addAlarmAction(alarmAction);
    }

    // API Gateway Alarms
    if (props.httpApi) {
      new cloudwatch.Alarm(this, "ApiGateway5xxAlarm", {
        metric: new cloudwatch.Metric({
          namespace: "AWS/ApiGateway",
          metricName: "5XXError",
          dimensions: { ApiId: props.httpApi.apiId },
          period: Duration.minutes(5),
          statistic: "Sum"
        }),
        threshold: 10,
        evaluationPeriods: 1,
        alarmDescription: "API Gateway 5xx errors - backend issue"
      }).addAlarmAction(alarmAction);

      new cloudwatch.Alarm(this, "ApiGatewayHighLatencyAlarm", {
        metric: new cloudwatch.Metric({
          namespace: "AWS/ApiGateway",
          metricName: "Latency",
          dimensions: { ApiId: props.httpApi.apiId },
          period: Duration.minutes(5),
          statistic: "p99"
        }),
        threshold: 5000, // 5 seconds p99 latency
        evaluationPeriods: 2,
        alarmDescription: "API Gateway p99 latency high"
      }).addAlarmAction(alarmAction);
    }

    new CfnOutput(this, "AlertTopicArn", { value: this.alertTopic.topicArn });
    new CfnOutput(this, "PlatformKeyArn", { value: this.platformKey.keyArn });
    new CfnOutput(this, "WebAclArn", { value: this.webAcl.attrArn });
  }
}
