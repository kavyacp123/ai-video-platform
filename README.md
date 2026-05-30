# Serverless AI Video Platform

JavaScript-only AWS CDK project for an event-driven AI video platform.

## What Is Implemented

- React + Vite frontend with upload, dashboard, watch view, HLS.js playback, and Cognito/Amplify wiring
- Cognito auth with Google OAuth support
- HTTP API for upload URLs, metadata, stream info, status, video listing, and async deletion
- WebSocket API for video-ready/video-failed notifications
- S3 storage for raw videos, HLS output, thumbnails, and subtitles
- DynamoDB single-table data model with user, video, event, idempotency, and circuit-breaker records
- EventBridge bus and typed event utilities
- AI Supervisor Agent using Bedrock Nova Lite, DynamoDB idempotency, and DynamoDB-backed circuit breaker
- Step Functions Express processing pipeline
- MediaConvert path using `waitForTaskToken`
- Custom FFmpeg ECS Fargate worker path using SQS FIFO and Step Functions task callbacks
- Subtitle, moderation, thumbnail, frame extraction, and clip-generation handlers
- Async deletion pipeline that cleans S3 assets, invalidates CloudFront, and deletes DynamoDB records
- CloudFront delivery with OAC and signed URL utility
- KMS-backed sensitive storage, WAF, SNS alerts, and CloudWatch alarms scaffold
- GitHub Actions, preflight checks, post-deploy env generation, unit tests, and integration test scaffold

## Structure

```text
infra/                 CDK stacks
functions/             Lambda handlers, one folder per function
shared/                reusable JS services
frontend/              React + Vite app
workers/ffmpeg-worker/ ECS Fargate FFmpeg worker container
scripts/               deployment and preflight scripts
docs/                  architecture and IAM notes
tests/                 unit and integration tests
```

## Deploy Prep

Create AWS and app configuration:

```bash
cp .env.example .env
```

Required before production deploy:

- `MEDIACONVERT_ENDPOINT`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CF_KEY_GROUP_ID`
- `CF_KEY_PAIR_ID`
- `ALERT_EMAIL`
- `cloudfront/signing-key` secret in Secrets Manager
- ECR image for `ffmpeg-worker`

Build and push the FFmpeg worker:

```bash
bash scripts/build-and-push.sh
```

Run checks:

```bash
npm run preflight
cd infra && npx cdk synth -c mediaConvertEndpoint=$MEDIACONVERT_ENDPOINT
cd ../frontend && npm run build
```

## Deploy Order

```bash
cd infra
npx cdk deploy StorageStack
npx cdk deploy AuthStack
npx cdk deploy EventStack
npx cdk deploy DeliveryStack
npx cdk deploy PipelineStack
npx cdk deploy ApiStack
npx cdk deploy CustomTranscoderStack
npx cdk deploy HardeningStack
```

Then generate frontend environment values:

```bash
bash scripts/post-deploy.sh
```

## Remaining Production Work

- Run the real AWS integration test after deploying.
- Narrow CloudFront bucket-policy `AWS:SourceArn` from same-account distribution wildcard to the exact distribution ARN if you move delivery-owned buckets into one stack.
- Replace simple frontend page switching with React Router.
- Expand unit tests around JWT verification, quota enforcement, deletion workflow, and worker job payloads.

