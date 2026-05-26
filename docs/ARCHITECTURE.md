# Serverless AI Video Platform

This codebase is JavaScript-only.

```text
React + HLS.js
  -> HTTP API + Cognito JWT
  -> S3 presigned upload
  -> S3 Object Created EventBridge event
  -> AI Supervisor Agent
  -> AI_PLAN_CREATED
  -> Step Functions Express pipeline
  -> MediaConvert / Transcribe / Rekognition / Translate / thumbnail / clips
  -> CloudFront HLS delivery
  -> WebSocket + SNS-ready notification path
```

## Implemented Sections

- Section 1: JavaScript CDK scaffold with six stacks
- Section 2: S3 buckets, lifecycle, EventBridge notifications, presign helpers
- Section 3: Cognito, HTTP API, route Lambdas, WebSocket API
- Section 4: DynamoDB single-table design and service class
- Section 5: EventBridge bus, events, parser, publisher, SQS queues and DLQ
- Section 6: AI Supervisor Agent with Bedrock integration, fallback plan, idempotency, circuit breaker
- Section 7: Step Functions Express pipeline
- Section 8: MediaConvert HLS job builder and poller
- Section 9: Subtitle and moderation agent handlers
- Section 10: CloudFront delivery stack and signed URL utility
- Section 11: WebSocket notification handlers and React hook
- Section 12: React pages/components in JSX
- Section 13: X-Ray enabled on Lambdas and Step Functions; structured logger helper
- Section 14: JWT authorizer skeleton, Secrets Manager helper, least-privilege roles
- Section 15: env example, GitHub Actions workflow, tests
- Phase 2: Custom FFmpeg transcoder data plane with SQS + ECS Fargate worker scaffold
- Completion pass: async deletion workflow, CloudFront OAC hardening, and KMS-backed sensitive storage

## Phase 2 Custom Transcoder

The project now has a MediaConvert path and a custom FFmpeg path.

```text
Step Functions
  -> Custom Transcode Orchestrator
  -> SQS FIFO worker queue
  -> ECS Fargate FFmpeg workers
  -> processed S3 custom-hls/<videoId>/<resolution>/
  -> Playlist Assembler
  -> CloudFront playback
```

Worker code lives in `workers/ffmpeg-worker`. The CDK stack uses a registry placeholder image for synth safety. For real deployment, build and push the worker Dockerfile to ECR, then replace the container image in `CustomTranscoderStack`.

## Deployment Order

```bash
cd infra
npx cdk deploy StorageStack
npx cdk deploy AuthStack
npx cdk deploy EventStack
npx cdk deploy DeliveryStack
npx cdk deploy ApiStack
npx cdk deploy PipelineStack
```

## Important Hardening TODO

CloudFront OAC is now attached in `DeliveryStack`, and processed/subtitle/thumbnail buckets include CloudFront-service-principal read policies. The policy uses a same-account CloudFront distribution ARN wildcard to avoid cross-stack dependency cycles. For a stricter production deployment, split delivery-owned buckets into the same stack as CloudFront or import a concrete distribution id after first deploy and narrow `AWS:SourceArn` to one distribution.

## Deletion Workflow

`DELETE /video/{id}` starts `video-deletion-pipeline` and returns `202 Accepted`.

```text
MarkDeleting
  -> DeleteAssetsInParallel
       -> DeleteRawVideo
       -> DeleteHLSOutput
       -> DeleteCustomHLSOutput
       -> DeleteSubtitles
       -> DeleteThumbnails
       -> InvalidateCloudFront
  -> DeleteDynamoRecord
```

If asset deletion fails, the workflow marks the video `DELETE_FAILED` and publishes `VIDEO_DELETE_FAILED`.
