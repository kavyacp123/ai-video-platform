#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { StorageStack } from "../lib/stacks/storage-stack.js";
import { AuthStack } from "../lib/stacks/auth-stack.js";
import { EventStack } from "../lib/stacks/event-stack.js";
import { DeliveryStack } from "../lib/stacks/delivery-stack.js";
import { ApiStack } from "../lib/stacks/api-stack.js";
import { PipelineStack } from "../lib/stacks/pipeline-stack.js";
import { CustomTranscoderStack } from "../lib/stacks/custom-transcoder-stack.js";
import { HardeningStack } from "../lib/stacks/hardening-stack.js";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "ap-south-1"
};

const storage = new StorageStack(app, "StorageStack", { env });
const auth = new AuthStack(app, "AuthStack", {
  env,
  table: storage.table
});
const events = new EventStack(app, "EventStack", {
  env,
  table: storage.table
});
const delivery = new DeliveryStack(app, "DeliveryStack", {
  env,
  processedBucket: storage.processedBucket,
  thumbnailsBucket: storage.thumbnailsBucket,
  subtitleBucket: storage.subtitleBucket
});
const mediaConvertEndpoint = app.node.tryGetContext("mediaConvertEndpoint") || process.env.MEDIACONVERT_ENDPOINT;
if (!mediaConvertEndpoint) {
  throw new Error(
    "Missing MediaConvert endpoint. Set MEDIACONVERT_ENDPOINT or pass -c mediaConvertEndpoint=https://xxxx.mediaconvert.<region>.amazonaws.com"
  );
}
const pipeline = new PipelineStack(app, "PipelineStack", {
  env,
  storage,
  eventBus: events.bus,
  cloudFrontDomain: delivery.distribution.distributionDomainName,
  cloudFrontDistributionId: delivery.distribution.distributionId,
  mediaConvertEndpoint
});
const api = new ApiStack(app, "ApiStack", {
  env,
  storage,
  auth,
  eventBus: events.bus,
  cloudFrontDomain: delivery.distribution.distributionDomainName,
  deletionStateMachine: pipeline.deletionStateMachine
});
const customTranscoder = new CustomTranscoderStack(app, "CustomTranscoderStack", {
  env,
  storage,
  eventBus: events.bus,
  cloudFrontDomain: delivery.distribution.distributionDomainName
});
new HardeningStack(app, "HardeningStack", {
  env,
  httpApi: api.httpApi,
  stateMachine: pipeline.stateMachine,
  agentDlq: events.agentDlq,
  criticalFunctions: [...(api.criticalFunctions || []), pipeline.supervisorFn],
  platformKey: storage.platformKey
});

new cdk.CfnOutput(api, "DeploymentOrder", {
  value:
    "StorageStack -> AuthStack -> EventStack -> DeliveryStack -> ApiStack -> PipelineStack -> CustomTranscoderStack"
});
