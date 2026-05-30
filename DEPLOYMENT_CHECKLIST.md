# Deployment Checklist

Production deployment requires careful sequencing and validation.

## Environment Setup

- [ ] AWS Account created with appropriate permissions
- [ ] IAM user/role configured with programmatic access
- [ ] AWS CLI v2 installed and configured: `aws configure`
- [ ] Node.js 20.x or higher installed
- [ ] Docker installed for building FFmpeg worker image

## Pre-Deployment Configuration

- [ ] Copy `.env.example` to `.env`
- [ ] Set all required environment variables:
  - [ ] `MEDIACONVERT_ENDPOINT` - Get from AWS account
  - [ ] `GOOGLE_CLIENT_ID` - From Google Cloud Console
  - [ ] `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
  - [ ] `CF_KEY_GROUP_ID` - CloudFront public key group ID
  - [ ] `CF_KEY_PAIR_ID` - CloudFront keypair ID
  - [ ] `ALERT_EMAIL` - Email for CloudWatch alarms
  - [ ] `BEDROCK_MODEL_ID` - Default: `amazon.nova-lite-v1:0`
- [ ] Create CloudFront signing key secret in AWS Secrets Manager:
  ```bash
  aws secretsmanager create-secret \
    --name cloudfront/signing-key \
    --secret-string file://path/to/private-key.pem
  ```
- [ ] Upload FFmpeg worker container image to ECR:
  ```bash
  bash scripts/build-and-push.sh
  ```

## Pre-Deployment Validation

- [ ] Run preflight checks: `npm run preflight`
- [ ] Syntax check functions: `npm run check:functions`
- [ ] Run unit tests: `npm test`
- [ ] Run integration test scaffold: `npm run test:integration`
- [ ] Verify CDK synthesizes: `cd infra && npx cdk synth`
- [ ] Review frontend build: `npm run build:frontend`

## Deployment Sequence

**Important:** Deploy in this exact order due to cross-stack dependencies.

### 1. Storage Layer
```bash
cd infra
npx cdk deploy StorageStack -c mediaConvertEndpoint=$MEDIACONVERT_ENDPOINT
```
**Validates:** DynamoDB table created, S3 buckets available, KMS key rotated
**Output:** Table name, bucket names, KMS ARN

### 2. Authentication
```bash
npx cdk deploy AuthStack
```
**Validates:** Cognito User Pool created, Google OAuth configured
**Output:** User Pool ID, Client ID, Domain

### 3. Event Infrastructure
```bash
npx cdk deploy EventStack
```
**Validates:** EventBridge bus created, SQS queues initialized
**Output:** Event bus ARN, queue URLs

### 4. Content Delivery
```bash
npx cdk deploy DeliveryStack
```
**Validates:** CloudFront distribution created, OAC configured
**Output:** Distribution domain, cache behaviors

### 5. Video Processing Pipeline
```bash
npx cdk deploy PipelineStack
```
**Validates:** Lambda functions deployed with correct IAM, Step Functions state machine created
**Output:** State machine ARN, function ARNs

### 6. API Layer
```bash
npx cdk deploy ApiStack
```
**Validates:** HTTP API endpoints functional, WebSocket API connected
**Output:** API URL, WebSocket URL

### 7. Custom Transcoder
```bash
npx cdk deploy CustomTranscoderStack
```
**Validates:** ECS cluster created, auto-scaling configured
**Output:** ECS cluster ARN, service name

### 8. Hardening & Monitoring
```bash
npx cdk deploy HardeningStack
```
**Validates:** WAF rules attached, CloudWatch alarms enabled, SNS topic subscribed
**Output:** Alert topic ARN, WAF ACL ARN

## Post-Deployment

- [ ] Generate frontend `.env.local`:
  ```bash
  bash scripts/post-deploy.sh
  ```
- [ ] Verify frontend environment variables set:
  - `VITE_API_URL` - Should point to ApiStack HTTP API
  - `VITE_REGION` - AWS region
  - `VITE_USER_POOL_ID` - From AuthStack
  - `VITE_CLIENT_ID` - From AuthStack
  - `VITE_IDENTITY_POOL_ID` - From AuthStack

## Functional Validation

### 1. Authentication Flow
- [ ] Navigate to frontend
- [ ] Click "Sign In"
- [ ] Redirect to Cognito login page appears
- [ ] Login with test credentials succeeds
- [ ] Redirected back to frontend with auth token

### 2. Upload Flow
- [ ] Select video file (test with <100MB video)
- [ ] Click "Upload"
- [ ] Video appears in dashboard with status "UPLOAD_URL_CREATED"
- [ ] After 30-60 seconds, status changes to "AI_PLAN_CREATED"
- [ ] Processing continues (should take 2-5 minutes for transcoding)

### 3. Stream Validation
- [ ] Once status is "READY", click "Watch"
- [ ] HLS player loads
- [ ] Video plays without errors
- [ ] Multiple resolutions available (test adaptive bitrate)

### 4. WebSocket Notifications
- [ ] Upload video on one browser tab
- [ ] Open same app in another tab
- [ ] Notifications appear in real-time as video processes
- [ ] Status updates synchronized across tabs

### 5. Error Handling
- [ ] Upload video >50GB - should get error
- [ ] Upload with invalid content type - should get error
- [ ] Try accessing another user's video - should get 403
- [ ] Exceed daily quota - should get 429

### 6. Monitoring
- [ ] Check CloudWatch dashboard for metric graphs
- [ ] Verify alarms created in SNS console
- [ ] Trigger test alarm: modify a Lambda timeout, observe alarm
- [ ] Confirm alert email received

## Production Hardening

- [ ] CloudFront bucket policy narrowed:
  - Change `AWS:SourceArn` from wildcard to exact distribution ARN
  - Remove same-account dependency to avoid future issues

- [ ] WAF rules tuned:
  - Review CloudWatch metrics for false positives
  - Adjust rate limits if needed
  - Consider GeoIP restrictions

- [ ] Database backups enabled:
  - Point-in-time recovery already enabled
  - Create on-demand backup before go-live
  - Test restore procedure

- [ ] Secrets rotated:
  - CloudFront signing key
  - Google OAuth secrets
  - DB passwords (if applicable)

- [ ] Monitoring thresholds tuned:
  - Adjust based on expected load
  - Set up on-call rotation
  - Document runbook for common alerts

## Rollback Procedure

If critical issue found:

```bash
cd infra
npx cdk destroy --all  # Removes all stacks in reverse order
```

**Note:** This destroys everything including DynamoDB and S3 data. For production, consider:
- Creating stack policies to prevent accidental deletion
- Exporting DynamoDB data before destruction
- Keeping CloudFormation change sets for gradual rollback

## Scaling Considerations

- [ ] DynamoDB on-demand billing suitable for MVP
- [ ] For predictable traffic, switch to provisioned: adjust `billingMode` in StorageStack
- [ ] Monitor Lambda concurrent executions; increase if throttling observed
- [ ] Review SQS queue depth during peak hours; adjust worker count
- [ ] CloudFront cache hit ratio should be >80% after warmup

## Monitoring & Alerts

- [ ] Verify SNS alert email configured
- [ ] Test alert by manually triggering Lambda error
- [ ] Set up Slack/PagerDuty integration if desired:
  ```bash
  # Example: SNS to Lambda to Slack
  npx cdk deploy AlertingStack  # custom stack
  ```

- [ ] Create CloudWatch dashboard:
  - Lambda error rates
  - DynamoDB throttle events
  - API latency (p50, p99)
  - SQS queue depth
  - FFmpeg worker utilization

## Go-Live Checklist

- [ ] All validation tests passed
- [ ] Load testing completed (if applicable)
- [ ] Data retention policies documented
- [ ] GDPR/privacy compliance reviewed (if applicable)
- [ ] Support runbook created
- [ ] Incident response procedures documented
- [ ] Team trained on deployment/rollback
- [ ] Scheduled maintenance window communicated

---

**Estimated total deployment time:** 20-30 minutes (after pre-deployment setup)

**Support:** See [ARCHITECTURE.md](../docs/ARCHITECTURE.md) and [IAM_ROLES.md](../docs/IAM_ROLES.md) for details.
