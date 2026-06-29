<p align="center">
  <img src="https://img.shields.io/badge/AWS-23+_Services-FF9900?style=for-the-badge&logo=amazonaws" />
  <img src="https://img.shields.io/badge/AI-Amazon_Bedrock-8A2BE2?style=for-the-badge&logo=amazon" />
  <img src="https://img.shields.io/badge/IaC-AWS_CDK-2196F3?style=for-the-badge&logo=awsorganizations" />
  <img src="https://img.shields.io/badge/Runtime-Node.js_20-339933?style=for-the-badge&logo=nodedotjs" />
  <img src="https://img.shields.io/badge/Frontend-React_18-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/Architecture-Serverless-FFA500?style=for-the-badge&logo=serverless" />
</p>

# 🎬 AI Video Platform — Serverless AI-Powered Video Streaming & Analytics

A **production-grade, fully serverless video platform** built on AWS that uses **AI agents powered by Amazon Bedrock** to autonomously analyze, transcode, moderate, and enrich uploaded videos — then delivers them via **HLS adaptive bitrate streaming** through CloudFront CDN.

The platform features **4 AI agents**, **dual transcoding engines**, **real-time analytics**, a **full social layer**, and is deployed across **8 CDK stacks** using **23+ AWS services** — all defined as **Infrastructure as Code**.

---

## 📐 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          REACT + VITE FRONTEND                         │
│     HLS.js Player · Dashboard · Upload · Admin · Social Features       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  HTTPS / WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     API GATEWAY (HTTP + WebSocket)                       │
│              JWT Authorizer · WAFv2 · CORS · 26 REST Routes             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  S3 Presigned │    │   Lambda (38+)   │    │    Cognito       │
│    Upload     │    │  API Handlers    │    │  User Pool +     │
│              │    │  Pipeline Steps  │    │  Google OAuth    │
└──────┬───────┘    └────────┬─────────┘    └─────────────────┘
       │                     │
       ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│  EventBridge  │◄───│    DynamoDB       │
│  Custom Bus   │    │  Single-Table    │
└──────┬───────┘    │  Design (2 GSIs) │
       │            └──────────────────┘
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    🤖 AI SUPERVISOR AGENT (Bedrock)                      │
│          Analyzes video → Creates intelligent processing plan            │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ AI_PLAN_CREATED event
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  STEP FUNCTIONS PIPELINE (STANDARD)                      │
│                                                                          │
│  ValidateInput                                                           │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────── PARALLEL BRANCHES ──────────────────┐                  │
│  │                    │                    │           │                  │
│  ▼                    ▼                    ▼           │                  │
│  Transcode         Subtitles           Moderation     │                  │
│  (FFmpeg/MC)       (Transcribe →       (Rekognition)  │                  │
│  WAIT_FOR_TOKEN    Translate)                         │                  │
│  │                                                    │                  │
│  └────────────────────┬───────────────────────────────┘                  │
│                       ▼                                                  │
│               GenerateMetadata (AI)                                      │
│                       ▼                                                  │
│               AggregateResults                                           │
│                       │                     ┌──────────────┐             │
│                       │        on error ───►│ HandleFailure│             │
│                       ▼                     └──────────────┘             │
└──────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     CLOUDFRONT CDN (OAC + Signed URLs)                   │
│           HLS Segments · Thumbnails · Subtitles · Clips                  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 AI Agents (Amazon Bedrock — Nova Pro)

This platform is **AI-first** — not as a bolt-on feature, but as the core decision-making layer.

| Agent | What It Does |
|-------|-------------|
| **AI Supervisor** | Intercepts every upload, analyzes video metadata, and creates an intelligent processing plan — deciding resolutions, whether to generate subtitles/highlights, and moderation level. Includes **circuit breaker** and **fallback plan** for resilience. |
| **AI Metadata Generator** | Auto-generates SEO-optimized **title**, **description**, **tags**, and **category** from transcription text, filename, and moderation results. |
| **AI Clips Agent** | Analyzes transcription and metadata to identify **highlight moments**, then generates FFmpeg-compatible clip extraction commands. Falls back to evenly-spaced clips if AI fails. |
| **AI Thumbnail Agent** | Scores extracted video frames and selects the most **visually engaging thumbnail** using custom criteria (scene composition, people, visual interest). |

---

## ⚡ Key Engineering Highlights

### Dual Transcoding Engines
The platform intelligently routes videos to the optimal transcoding backend:

| Engine | When Used | How |
|--------|----------|-----|
| **AWS MediaConvert** | Standard videos | Managed service, `WAIT_FOR_TASK_TOKEN` callback |
| **Custom FFmpeg on ECS Fargate** | Large files (>2 GB), highlight generation | ARM64, 4 vCPU / 16 GB, SQS FIFO queue, **single-pass** processing |

The FFmpeg worker produces **HLS segments + thumbnail + extracted frames + highlight clip** in a single FFmpeg invocation, then calls back to Step Functions via `SendTaskSuccess`.

### Scale-to-Zero Auto Scaling
The Fargate FFmpeg service starts at **0 desired tasks** and auto-scales based on SQS queue depth — paying nothing when idle, scaling up to 20 concurrent workers under load.

### Event-Driven Architecture
All components communicate through a **custom EventBridge bus** with typed events:
```
VIDEO_UPLOADED → AI_PLAN_CREATED → TRANSCODE_STARTED → RENDITION_COMPLETE
→ VIDEO_READY / VIDEO_FAILED → WebSocket push to client
```

### Circuit Breaker Pattern
AI calls to Bedrock are wrapped in a **circuit breaker** with three states (CLOSED → OPEN → HALF_OPEN), automatic failure tracking, and configurable reset timeouts — ensuring the pipeline never hangs on AI outages.

### Single-Table DynamoDB Design
One table with **2 GSIs** handles 17+ access patterns:
- Videos, users, comments, likes, ratings, follows
- Watch sessions, engagement events, analytics
- WebSocket connections, audit logs
- Idempotency keys, circuit breaker state

Uses **conditional writes** for idempotency and **atomic counters** for likes, ratings (running averages), and follower counts.

---

## 🏗️ Infrastructure — 8 CDK Stacks

| Stack | Purpose | Key Resources |
|-------|---------|---------------|
| **StorageStack** | Data layer | 4 S3 buckets, DynamoDB table, lifecycle policies, KMS encryption |
| **AuthStack** | Authentication | Cognito User Pool, Google OAuth, post-confirmation trigger |
| **EventStack** | Messaging | EventBridge bus, SQS queues (notification + alert), DLQs |
| **DeliveryStack** | Content delivery | CloudFront CDN, OAC, signed URLs, security headers, multi-origin |
| **ApiStack** | API layer | HTTP API (26 routes), WebSocket API (3 routes), JWT authorizer |
| **PipelineStack** | Processing | 2 Step Functions state machines, 38+ Lambda functions, EventBridge rules |
| **CustomTranscoderStack** | Custom transcoding | ECS Fargate cluster, SQS FIFO, auto-scaling, ECR |
| **HardeningStack** | Security | WAFv2, KMS, Secrets Manager, 15+ CloudWatch alarms, SNS |

### 23+ AWS Services Integrated

| Category | Services |
|----------|---------|
| **Compute** | Lambda (Node.js 20, ARM64), ECS Fargate (ARM64), Step Functions |
| **Storage** | S3 (4 buckets), DynamoDB (single-table, PITR, TTL) |
| **API** | API Gateway v2 (HTTP + WebSocket), CloudFront CDN |
| **Auth** | Cognito User Pool + Google OAuth Federation |
| **AI/ML** | Bedrock (Nova Pro), Rekognition, Transcribe, Translate |
| **Media** | MediaConvert |
| **Messaging** | EventBridge, SQS (FIFO + standard), SNS |
| **Security** | WAFv2, KMS, Secrets Manager, IAM (least-privilege) |
| **Observability** | CloudWatch Alarms, X-Ray Tracing, Structured Logging |
| **CI/CD** | GitHub Actions (OIDC), ECR |

---

## 🎨 Frontend

Built with **React 18 + Vite**, featuring a glassmorphism dark theme with gradient accents.

### Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Video library grid with Netflix-style hover previews, status badges, CloudFront thumbnails |
| **Upload** | Drag-and-drop zone with presigned S3 upload, XHR progress bar |
| **Watch** | Cinematic HLS player with quality selection, subtitles, social features |
| **Admin** | Audit log viewer with action filtering, content moderation queue |

### Components (12)

| Component | Purpose |
|-----------|---------|
| `VideoWatch` | Core HLS.js player with Safari native fallback |
| `CommentSection` | Threaded comments with avatars and timestamps |
| `LikeButton` | Optimistic toggle with animated heart |
| `VideoRatings` | 5-star rating with hover preview and scale animation |
| `FollowButton` | Creator follow/unfollow with follower count |
| `EngagementTracker` | Tracks play/pause/skip/replay events |
| `HeatmapViewer` | Visual timeline heatmap (green→yellow→red) |
| `VideoAnalyticsDashboard` | Real-time stats: views, likes, avg rating, engagement breakdown |
| `RecommendationsPanel` | AI similarity-scored video suggestions |
| `NotificationCenter` | Bell icon with unread badge, 30s polling, categorized notifications |
| `ViolationReportDialog` | 7-category content reporting modal |
| `AdminDashboard` | Full admin panel with audit logs and moderation |

---

## 📡 API — 26 REST Endpoints + WebSocket

### Video Management
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/upload-url` | Get presigned S3 upload URL |
| `GET` | `/videos` | List all videos (paginated) |
| `GET` | `/video/{id}` | Get video details |
| `GET` | `/stream/{id}` | Get HLS streaming URL |
| `GET` | `/video/{id}/status` | Get processing status |
| `DELETE` | `/video/{id}` | Delete video (triggers async cleanup pipeline) |

### Social Features
| Method | Route | Description |
|--------|-------|-------------|
| `POST / DELETE` | `/video/{id}/like` | Like / unlike video |
| `POST` | `/video/{id}/rate` | Rate video (1–5 stars) |
| `GET / POST` | `/video/{id}/comments` | Get / create comments |
| `POST / DELETE` | `/user/{id}/follow` | Follow / unfollow creator |

### Analytics & AI
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/video/{id}/watch` | Track watch session |
| `POST` | `/video/{id}/engagement` | Track engagement events |
| `GET` | `/video/{id}/analytics` | Aggregated video metrics |
| `GET` | `/video/{id}/heatmap` | Engagement heatmap data |
| `GET` | `/recommendations` | AI-powered recommendations |

### Admin & Compliance
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/video/{id}/report` | Report content violation |
| `GET` | `/admin/audit-logs` | Query audit trail |
| `POST` | `/notifications/send` | Send notification |

### WebSocket
Real-time push notifications for `VIDEO_READY` and `VIDEO_FAILED` events via `$connect`, `$disconnect`, `$default` routes.

---

## 🔒 Security

| Layer | Implementation |
|-------|---------------|
| **Authentication** | Cognito User Pool + Google OAuth, JWT Lambda authorizer |
| **WAF** | AWS Managed Rules (Common, Known Bad Inputs, SQL Injection), IP rate limiting |
| **Encryption at Rest** | KMS customer-managed key (yearly rotation) for S3, DynamoDB |
| **Encryption in Transit** | TLS 1.2 minimum on CloudFront, HTTPS-only viewer policy |
| **CDN Security** | Origin Access Control (OAC, not legacy OAI), signed URLs for HLS manifests |
| **IAM** | Least-privilege per-function roles — each Lambda gets its own dedicated IAM role |
| **Headers** | HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| **Data Protection** | S3 Block Public Access, DynamoDB Point-in-Time Recovery |
| **Secrets** | Secrets Manager with KMS encryption for OAuth keys, CloudFront signing key |
| **CI/CD** | OIDC-based role assumption — no long-lived AWS credentials |

---

## 📊 Monitoring & Observability

- **15+ CloudWatch Alarms** — Lambda errors, API 5xx rates, Step Functions failures, DLQ depth, DynamoDB throttles
- **X-Ray Tracing** — enabled on all Lambda functions and both Step Functions state machines
- **Structured JSON Logging** — across all Lambdas and ECS containers with correlation IDs
- **Custom CloudWatch Metrics** — from FFmpeg worker (processing duration, file sizes, output counts)
- **SNS Alert Topic** — email notifications for all alarm state changes
- **S3 Lifecycle Policies** — raw videos transition to Infrequent Access (30d) → Glacier (90d)

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- AWS CLI configured
- AWS CDK CLI (`npm i -g aws-cdk`)
- Docker (for FFmpeg worker image)

### Setup

```bash
# Clone the repo
git clone https://github.com/your-username/ai-video-platform.git
cd ai-video-platform

# Install dependencies
npm install
cd frontend && npm install && cd ..
cd infra && npm install && cd ..

# Configure environment
cp .env.example .env
# Fill in: MEDIACONVERT_ENDPOINT, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
#          CF_KEY_GROUP_ID, CF_KEY_PAIR_ID, ALERT_EMAIL
```

### Build & Push FFmpeg Worker

```bash
bash scripts/build-and-push.sh
```

### Deploy (in order)

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

### Post-Deploy

```bash
# Generate frontend environment config from stack outputs
bash scripts/post-deploy.sh

# Build and serve frontend
cd frontend && npm run build
```

### Run Locally

```bash
# Frontend dev server
cd frontend && npm run dev

# Validate all Lambda syntax
npm run check:functions

# Run tests
npm test
```

---

## 🧪 Testing

| Type | Runner | Coverage |
|------|--------|----------|
| **Unit Tests** | Node.js `node:test` | Event parser, processing plan builder, circuit breaker state machine |
| **Integration Tests** | Jest | Full API flow (upload URL → list → status → stream) |
| **Syntax Validation** | `node --check` | All Lambda + shared module JS files |
| **CDK Synth** | `cdk synth` | CloudFormation template generation validation |

```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run check:functions     # Syntax check all JS files
cd infra && npx cdk synth   # Validate infrastructure
```

---

## 📁 Project Structure

```
ai-video-platform/
├── frontend/                   React + Vite application
│   ├── src/
│   │   ├── components/         12 React components
│   │   ├── pages/              4 page components
│   │   ├── services/           API client
│   │   └── styles.css          Design system
│   └── vite.config.js
│
├── functions/                  38+ Lambda handlers (one folder per function)
│   ├── ai-supervisor/          AI Supervisor Agent
│   ├── aggregate-results/      Pipeline result aggregation
│   ├── create-comment/         Social — comments
│   ├── follow-user/            Social — follow/unfollow
│   ├── generate-heatmap/       Analytics — engagement heatmap
│   ├── generate-metadata/      AI Metadata Agent
│   ├── get-recommendations/    AI recommendations
│   ├── handle-failure/         Pipeline error handler
│   ├── jwt-authorizer/         JWT token validation
│   ├── like-video/             Social — likes
│   ├── rate-video/             Social — ratings
│   ├── run-moderation/         Rekognition content moderation
│   ├── start-ffmpeg-job/       FFmpeg transcoding trigger
│   ├── start-transcode/        MediaConvert job builder
│   ├── start-transcription/    Transcribe subtitle generation
│   ├── track-engagement/       Analytics — event tracking
│   ├── translate-subtitles/    Multi-language subtitle translation
│   ├── validate-input/         Pipeline input validation
│   └── ...                     (20+ more handlers)
│
├── shared/                     Reusable service libraries
│   ├── bedrockService.js       Amazon Bedrock AI wrapper
│   ├── circuitBreaker.js       Circuit breaker implementation
│   ├── clipsAgent.js           AI clip generation agent
│   ├── thumbnailAgent.js       AI thumbnail selection agent
│   ├── metadataAgent.js        AI metadata generation agent
│   ├── dynamoService.js        DynamoDB single-table service (17+ access patterns)
│   ├── eventPublisher.js       EventBridge publisher
│   ├── processingPlan.js       Processing plan builder
│   └── ...
│
├── infra/                      AWS CDK infrastructure
│   ├── bin/app.js              CDK app entry point
│   └── lib/stacks/             8 CDK stacks
│       ├── pipeline-stack.js       Step Functions + Lambda pipeline
│       ├── api-stack.js            API Gateway (26 routes + WebSocket)
│       ├── auth-stack.js           Cognito + Google OAuth
│       ├── delivery-stack.js       CloudFront CDN
│       ├── custom-transcoder-stack.js  ECS Fargate + SQS FIFO
│       ├── hardening-stack.js      WAF, KMS, alarms
│       ├── event-stack.js          EventBridge + SQS
│       └── storage-stack.js        S3 + DynamoDB
│
├── workers/ffmpeg-worker/      ECS Fargate container
│   ├── worker.js               Main worker process
│   ├── Dockerfile              ARM64 FFmpeg container
│   └── src/
│       ├── ffmpeg-builder.js   FFmpeg command builder
│       ├── manifest.js         HLS master playlist generator
│       ├── uploader.js         S3 upload handler
│       ├── metrics.js          CloudWatch custom metrics
│       └── logger.js           Structured JSON logger
│
├── tests/                      Unit + integration tests
├── scripts/                    Deployment & preflight scripts
├── docs/                       Architecture & IAM documentation
└── .github/workflows/          CI/CD pipeline (GitHub Actions + OIDC)
```

---

## 🛠️ Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, HLS.js, AWS Amplify, Lucide Icons |
| **Backend** | Node.js 20, Lambda (ARM64), ECS Fargate (ARM64) |
| **AI/ML** | Amazon Bedrock (Nova Pro), Rekognition, Transcribe, Translate |
| **Database** | DynamoDB (single-table design, 2 GSIs, PITR) |
| **Media** | MediaConvert, FFmpeg (custom), HLS adaptive streaming |
| **CDN** | CloudFront (OAC, signed URLs, multi-origin) |
| **Auth** | Cognito + Google OAuth Federation |
| **Events** | EventBridge, SQS (FIFO + standard), SNS |
| **Security** | WAFv2, KMS, Secrets Manager, IAM least-privilege |
| **IaC** | AWS CDK (JavaScript, 8 stacks) |
| **CI/CD** | GitHub Actions (OIDC, 3-stage pipeline) |
| **Observability** | CloudWatch, X-Ray, structured logging |

---

## 📄 License

This project is private and proprietary.
