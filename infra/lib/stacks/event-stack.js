import { CfnOutput, Duration } from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { BaseStack } from "../base-stack.js";

export class EventStack extends BaseStack {
  constructor(scope, id, props) {
    super(scope, id, props);

    this.bus = new events.EventBus(this, "VideoPlatformEventBus", {
      eventBusName: "video-platform-events"
    });

    this.agentDlq = new sqs.Queue(this, "AgentDlq", {
      queueName: "agent-dlq",
      retentionPeriod: Duration.days(14)
    });

    this.highQueue = new sqs.Queue(this, "AgentHighQueue", {
      queueName: "agent-queue-high.fifo",
      fifo: true,
      contentBasedDeduplication: true,
      deadLetterQueue: { queue: this.agentDlq, maxReceiveCount: 3 }
    });

    this.standardQueue = new sqs.Queue(this, "AgentStandardQueue", {
      queueName: "agent-queue-standard.fifo",
      fifo: true,
      contentBasedDeduplication: true,
      deadLetterQueue: { queue: this.agentDlq, maxReceiveCount: 3 }
    });

    const notification = this.createLambda("NotificationFunction", "notification", {
      environment: {
        TABLE_NAME: props.table.tableName,
        WEBSOCKET_CALLBACK_URL: "https://example.execute-api.local/dev"
      }
    });
    props.table.grantReadWriteData(notification.fn);
    this.addRolePolicy(notification.role, ["execute-api:ManageConnections"], ["*"]);

    const alert = this.createLambda("AlertFunction", "alert");

    new events.Rule(this, "VideoReadyRule", {
      eventBus: this.bus,
      eventPattern: {
        source: ["video-platform"],
        detailType: ["VIDEO_READY"]
      },
      targets: [new targets.LambdaFunction(notification.fn)]
    });

    new events.Rule(this, "VideoFailedRule", {
      eventBus: this.bus,
      eventPattern: {
        source: ["video-platform"],
        detailType: ["VIDEO_FAILED"]
      },
      targets: [new targets.LambdaFunction(alert.fn), new targets.SqsQueue(this.agentDlq)]
    });

    new CfnOutput(this, "EventBusName", { value: this.bus.eventBusName });
    new CfnOutput(this, "AgentHighQueueUrl", { value: this.highQueue.queueUrl });
    new CfnOutput(this, "AgentStandardQueueUrl", { value: this.standardQueue.queueUrl });
    new CfnOutput(this, "AgentDlqUrl", { value: this.agentDlq.queueUrl });
  }
}

