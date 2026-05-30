# Scaling Strategy

Production scaling plan for handling 10x-100x growth.

## Current Limits (Single Region)

| Component | Current Limit | Metric |
|-----------|--------------|--------|
| Lambda | 1,000 concurrent | Soft limit, can request increase |
| DynamoDB | On-demand unlimited | Pay-per-request, may spike costs |
| API Gateway | 10,000 RPS | Per API, regional |
| MediaConvert | 10 concurrent jobs | Per region, requestable |
| SQS FIFO | 3,000 msgs/sec | Per partition key |
| S3 | 3,500 PUT/sec per prefix | Per object key prefix |
| ECS Fargate | On-demand | Limited by AWS capacity |
| CloudFront | Edge locations | Global, highly available |

## Immediate Bottlenecks (100+ concurrent users)

### 1. SQS FIFO Throughput (3K msgs/sec limit)

**Problem:** FFmpeg worker queue uses single partition key, maxing at 3K msgs/sec
```
Current: SQS.FIFO(videoId)  → 1 partition key → bottleneck
```

**Solution: Partition by hash**
```javascript
// Before: partition key = videoId
const partitionKey = `${videoId % 10}-${Date.now()}`;
const messageGroupId = videoId;

await sqs.send(new SendMessageCommand({
  QueueUrl: queueUrl,
  MessageBody: JSON.stringify(job),
  MessageGroupId: messageGroupId,
  MessageDeduplicationId: `${videoId}-${timestamp}`,
  MessageSystemAttribute: {
    // Custom partition key sharding
  }
}));
```

**Impact:** Increases effective throughput to 30K msgs/sec (10 partitions)
**Effort:** Low | **Risk:** Medium (requires dead-letter queue monitoring)

---

### 2. DynamoDB GSI Hot Partition (STATUS#READY queries)

**Problem:** All queries to list "READY" videos hit single GSI partition
```
GSI2: GSI2PK=STATUS#READY → All ready videos map to 1 partition
```

**Current Query:**
```javascript
// This creates hot partition
const query = {
  IndexName: "GSI2",
  KeyConditionExpression: "GSI2PK = :pk",
  ExpressionAttributeValues: { ":pk": "STATUS#READY" }
};
```

**Solution A: Time-Bucketing (Recommended)**
```javascript
// Distribute by day
const today = new Date().toISOString().split('T')[0];
const pk = `STATUS#READY#${today}`;

// Query only recent ready videos
const query = {
  IndexName: "GSI3", // New GSI
  KeyConditionExpression: "GSI3PK = :pk AND GSI3SK > :yesterday",
  ExpressionAttributeValues: {
    ":pk": `STATUS#READY#${today}`,
    ":yesterday": yesterday
  }
};
```

**Solution B: Parallel Scans + Filtering**
```javascript
// For recommendations/discovery, use scan instead of query
const scan = {
  TableName,
  FilterExpression: "#status = :ready",
  Limit: 100,
  ProjectionExpression: "videoId,title,thumbnail"
};

// Then paginate with ExclusiveStartKey
```

**Impact:** Eliminates hot partition
**Effort:** Medium | **Risk:** Low (backward compatible if index added first)

---

### 3. DynamoDB Write Throughput Saturation

**Problem:** During peak uploads, write throughput exhausted

**Current:** Pay-per-request (scales but expensive)

**Solution: Provisioned Mode with AutoScaling**
```javascript
// In StorageStack
this.table = new dynamodb.Table(this, "VideoPlatformTable", {
  billingMode: dynamodb.BillingMode.PROVISIONED,
  readCapacity: 100,
  writeCapacity: 100,
  // ... other config
});

// Add autoscaling
const writeScaling = this.table.autoScaleWriteCapacity({
  minCapacity: 100,
  maxCapacity: 40000 // Allow burst
});

writeScaling.scaleOnUtilization({
  targetUtilization: 0.7,
  cooldownDuration: Duration.minutes(5)
});
```

**Savings at 100x scale:** ~70% cost reduction vs on-demand
**Effort:** Low | **Risk:** Low

---

## 10x Growth Plan (50K concurrent users)

### Phase 1: Optimize Existing (Weeks 1-2)

1. **Partition SQS FIFO queue** (2 hours implementation)
   - Enable 10x throughput without redesign
   - Monitor dead-letter queue

2. **Add DynamoDB time-bucketing GSI** (4 hours)
   - Eliminates hot partition
   - Enables efficient recent videos query

3. **Switch to DynamoDB provisioned** (2 hours)
   - Reduce costs
   - Configure autoscaling

4. **Monitor and tune alarms** (4 hours)
   - Set realistic thresholds based on new limits
   - Test alert accuracy

### Phase 2: Architecture Changes (Weeks 3-4)

#### Multi-Region Deployment

```
User in US → Route53 → us-east-1 API
User in EU → Route53 → eu-west-1 API
User in APAC → Route53 → ap-southeast-1 API
```

**Implementation:**
```bash
# Deploy pipeline-stack to each region
for region in us-east-1 eu-west-1 ap-southeast-1; do
  cd infra
  npx cdk deploy PipelineStack -c region=$region
done
```

**New limits per region:** All limits reset (1K Lambda, 10K API RPS, etc)
**Cost:** ~3x storage/compute, but latency improves 70%

#### Global Acceleration

```javascript
// CloudFront with Origin Shield (caches cache)
const distribution = new cloudfront.Distribution(this, "GlobalCDN", {
  defaultBehavior: {
    origin: new S3Origin(hlsBucket, {
      originShield: {
        enabled: true,
        region: "us-east-1" // Central shield location
      }
    })
  }
});
```

**Impact:** Reduces origin load by 80-90%
**Cost:** +$0.01/GB (minimal)

#### Read Replica Strategy

```javascript
// DynamoDB Global Tables (2-way replication)
const globalTable = new dynamodb.Table(this, "GlobalTable", {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  stream: dynamodb.StreamSpecification.NEW_AND_OLD_IMAGES,
  replicationRegions: ["eu-west-1", "ap-southeast-1"],
  // ... other config
});
```

**Pros:** Low-latency reads everywhere, automatic conflict resolution
**Cons:** Increased write latency (cross-region sync)
**Use case:** Good for user profiles, less good for real-time status

---

## 100x Growth Plan (500K concurrent users)

### Separate Read/Write Databases

```
Writes → Primary DynamoDB (us-east-1)
         ↓ (replication)
Reads ← Read Replicas (eu-west-1, ap-southeast-1)
```

**Implementation:**
```javascript
// TTL + periodic export to faster read stores (ElastiCache, Redis)

// Warm cache on startup
const cache = new redis.RedisClient();
cache.set(`VIDEO:${videoId}`, JSON.stringify(video), "EX", 3600);

// Query cache first, fall back to DynamoDB
let video = await cache.get(`VIDEO:${videoId}`);
if (!video) {
  video = await ddb.getVideo(videoId);
  await cache.set(`VIDEO:${videoId}`, JSON.stringify(video), "EX", 3600);
}
```

### API Rate Limiting per User

```javascript
// Current: free tier 5 uploads/day globally
// New: per-IP rate limiting on API Gateway

const wafv2 = new wafv2.CfnWebACL(this, "RateLimitPerUser", {
  scope: "REGIONAL",
  rules: [
    {
      name: "PerUserRateLimit",
      priority: 1,
      action: { block: {} },
      statement: {
        rateBasedStatement: {
          limit: 1000, // 1000 requests per 5 minutes per IP
          aggregateKeyType: "IP",
          scopeDownStatement: {
            byteMatchStatement: {
              fieldToMatch: { httpMethod: {} },
              positionalCharacter: "EXACTLY",
              textTransformation: [{ priority: 0, type: "NONE" }],
              searchString: "POST"
            }
          }
        }
      }
    }
  ]
});
```

### Video Encoding Offload

Instead of FFmpeg workers, use fully managed services:

```javascript
// AWS Elemental MediaPackage for HLS packaging
// AWS Elemental MediaLive for live streaming
// AWS Batch for distributed encoding (Kubernetes-style)

const batch = new batch.ComputeEnvironment(this, "EncodingCluster", {
  computeResources: {
    type: batch.ComputeType.ON_DEMAND,
    minvCpus: 0,
    maxvCpus: 256,
    desiredvCpus: 4,
    instanceRole: instanceRole,
    machineImage: ecs.EachMachineImage.fromAwsWindowsAmi(...),
    spotPrice: "0.50" // Use spot instances
  }
});
```

---

## Cost Projections

| Scale | DynamoDB | Lambda | S3 | MediaConvert | FFmpeg | Total |
|-------|----------|--------|----|--------------|---------|---------
| Current (1 user) | $0.25 | $0.10 | $0.05 | $0 | $0 | ~$0.50 |
| 100x (100 users) | $25 | $10 | $50 | $100 | $200 | ~$400/month |
| 1000x (1000 users) | $200 | $100 | $500 | $1000 | $2000 | ~$3,900/month |
| 10000x (10K users) | $2K | $1K | $5K | $10K | $20K | ~$39K/month |

**Cost optimization at 10Kx:**
- Switch to provisioned DynamoDB: -$800/month
- Use S3 Intelligent-Tiering: -$1000/month
- Spot instances for workers: -$10K/month
- **Optimized total: ~$27K/month**

---

## Monitoring for Scale

### Key Metrics to Track

```javascript
// CloudWatch dashboard
const metrics = [
  "Lambda.Concurrent",      // Alert if >800
  "Lambda.Duration.p99",    // Alert if >10s
  "DynamoDB.ConsumedWCU",   // Alert if >80% provisioned
  "DynamoDB.UserErrors",    // Alert if >0
  "SQS.ApproximateAgeOfOldestMessage", // Alert if >5min
  "API.Latency.p99",        // Alert if >1s
  "CloudFront.CacheHitRatio", // Alert if <70%
];
```

### Auto-Scaling Triggers

```javascript
// DynamoDB autoscaling (already configured)
// Lambda: Configure reserved concurrency + targeted scaling
// API Gateway: Built-in throttling per API key

// Custom: ECS Fargate autoscaling
const autoscaling = new autoscaling.AutoScalingGroup(this, "WorkerScaling", {
  vpc,
  desiredCapacity: 5,
  minCapacity: 1,
  maxCapacity: 100,
  machineImage: ecs.EachMachineImage.fromAsset("...")
});

// Scale based on SQS queue depth
autoscaling.scaleToTrackMetric("TrackQueueDepth", {
  metric: ffmpegQueue.metricApproximateNumberOfMessagesVisible(),
  targetValue: 10, // 1 task per 10 messages
});
```

---

## Recommended Roadmap

1. **Immediate (Weeks 1-2):** SQS partitioning, DynamoDB tuning, provisioned billing
2. **Short-term (Weeks 3-4):** Multi-region, caching layer, monitoring dashboard
3. **Medium-term (Months 2-3):** Global tables, advanced read replicas, API per-user limits
4. **Long-term (Months 4-6):** Separation of read/write databases, Kubernetes-based batch encoding

**Target:** Ready for 100x growth in 8 weeks with <2x cost increase

---

**Questions?** See [ARCHITECTURE.md](../docs/ARCHITECTURE.md) or check CloudWatch metrics.
