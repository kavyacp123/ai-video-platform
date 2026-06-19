# 🚀 COMPLETE DEPLOYMENT ROADMAP

**Date**: June 1, 2026  
**Status**: 🟢 **READY FOR DEPLOYMENT**  
**AWS Account**: 788184849410 (ap-south-1)  
**Google OAuth**: Configured ✅

---

## 📊 PROJECT OVERVIEW

### What's Built
- ✅ **14 Lambda Functions** (Social, Analytics, Admin, Advanced)
- ✅ **11 React Components** (Fully functional UI)
- ✅ **3 Frontend Pages** (Dashboard, Upload, Watch)
- ✅ **26 API Endpoints** (JWT protected)
- ✅ **Single DynamoDB Table** (Optimized schema with 2 GSIs)
- ✅ **Test Suite** (19 automated tests)
- ✅ **Complete Documentation** (5 guides)

### Key Metrics
| Metric | Value |
|--------|-------|
| Total Code Lines | ~4,150 |
| Production Code | ~2,100 lines |
| Documentation | ~1,700 lines |
| Test Coverage | 19 test cases |
| API Endpoints | 26 routes |
| Components | 11 reusable |

---

## 🔧 WHAT NEEDS TO BE DONE

### PHASE 1: PRE-DEPLOYMENT (15 minutes)

#### Step 1: Verify Environment ✅
```bash
✓ AWS Account: 788184849410 (VERIFIED)
✓ Region: ap-south-1 (VERIFIED)
✓ AWS CLI: Configured (VERIFIED)
✓ Node.js: v25.6.0 (VERIFIED)
✓ npm: 11.8.0 (VERIFIED)
✓ Google OAuth: Configured (VERIFIED)
```

#### Step 2: Set MediaConvert Endpoint ⏳ REQUIRED
```bash
# This is CRITICAL - without this, deployment will fail
export MEDIACONVERT_ENDPOINT="https://mediaconvert.ap-south-1.amazonaws.com"

# Verify
echo $MEDIACONVERT_ENDPOINT
```

#### Step 3: Verify All Code Files ⏳ REQUIRED
```bash
# Check Lambda functions (14 required)
ls functions/*/index.js | wc -l
# Expected: 14 ✅

# Check React components (11 required)
ls frontend/src/components/*.jsx | wc -l
# Expected: 11 ✅

# Check frontend pages (3 required)
ls frontend/src/pages/*.jsx | wc -l
# Expected: 3 ✅

# Check test scripts (3 required)
ls -la scripts/*.sh | grep rwx | wc -l
# Expected: 3 ✅
```

---

### PHASE 2: CDK DEPLOYMENT (20 minutes)

#### Step 4: Navigate to Infrastructure Directory
```bash
cd /Users/kavyapatel/Desktop/ai-video-platform/infra
```

#### Step 5: Install Dependencies (if needed)
```bash
# Check if modules exist
ls node_modules 2>/dev/null && echo "✅ OK" || npm install
```

#### Step 6: Synthesize Stack
```bash
# Validate without deploying
npx cdk synth --quiet

# Should create CloudFormation templates in cdk.out/
ls cdk.out/*.json && echo "✅ Synthesis successful"
```

#### Step 7: Deploy All Stacks
```bash
# Option A: One command (Recommended)
npx cdk deploy \
  StorageStack \
  AuthStack \
  EventStack \
  DeliveryStack \
  PipelineStack \
  CustomTranscoderStack \
  ApiStack \
  HardeningStack \
  --require-approval=never \
  --region ap-south-1

# Expected time: 15-25 minutes
# Watch for any errors in console output
```

**OR**

```bash
# Option B: Deploy individually with monitoring
npx cdk deploy StorageStack --require-approval=never
npx cdk deploy AuthStack --require-approval=never
npx cdk deploy EventStack --require-approval=never
npx cdk deploy DeliveryStack --require-approval=never
npx cdk deploy PipelineStack --require-approval=never
npx cdk deploy CustomTranscoderStack --require-approval=never
npx cdk deploy ApiStack --require-approval=never
npx cdk deploy HardeningStack --require-approval=never
```

#### Step 8: Verify Deployment ✅
```bash
# Check all stacks deployed
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE \
  --region ap-south-1 \
  --output table

# Should show 8 stacks (StorageStack, AuthStack, EventStack, etc.)

# Check for failures
aws cloudformation list-stacks \
  --stack-status-filter ROLLBACK_COMPLETE \
  --region ap-south-1

# Should be empty
```

---

### PHASE 3: EXTRACT OUTPUTS (5 minutes)

#### Step 9: Get API Endpoint
```bash
export API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ApiStack \
  --region ap-south-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

echo "📍 API Endpoint: $API_ENDPOINT"
# Should look like: https://xxxxx.execute-api.ap-south-1.amazonaws.com
```

#### Step 10: Get Cognito Info
```bash
export USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name AuthStack \
  --region ap-south-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

export CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name AuthStack \
  --region ap-south-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text)

echo "🔑 User Pool: $USER_POOL_ID"
echo "🔐 Client ID: $CLIENT_ID"
```

#### Step 11: Save Configuration
```bash
# Create .env for frontend
cat > /Users/kavyapatel/Desktop/ai-video-platform/frontend/.env << EOF
VITE_API_URL=$API_ENDPOINT
VITE_REGION=ap-south-1
VITE_USER_POOL_ID=$USER_POOL_ID
VITE_CLIENT_ID=$CLIENT_ID
EOF

echo "✅ Frontend .env created"
```

---

### PHASE 4: FRONTEND SETUP (10 minutes)

#### Step 12: Install Frontend Dependencies
```bash
cd /Users/kavyapatel/Desktop/ai-video-platform/frontend

# Install packages
npm install

# Verify
npm list react react-dom aws-amplify | head -5
```

#### Step 13: Build Frontend (Optional - for production)
```bash
# Test build
npm run build

# Should create dist/ directory without errors
ls dist/ && echo "✅ Build successful"
```

#### Step 14: Start Development Server
```bash
npm run dev

# Output will show:
# ➜  Local:   http://localhost:5173/
# ➜  press h to show help

# Keep this running in a separate terminal
```

---

### PHASE 5: USER CREATION & AUTHENTICATION (5 minutes)

#### Step 15: Create Test User
```bash
# Option A: Via AWS CLI
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username testuser@example.com \
  --message-action SUPPRESS \
  --temporary-password TempPassword123! \
  --region ap-south-1

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username testuser@example.com \
  --password TestPassword123! \
  --permanent \
  --region ap-south-1

echo "✅ Test user created: testuser@example.com / TestPassword123!"
```

#### Step 16: Get JWT Token
```bash
# Via AWS CLI
export JWT_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id $CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPassword123! \
  --region ap-south-1 \
  --query 'AuthenticationResult.AccessToken' \
  --output text)

echo "🔐 JWT Token: ${JWT_TOKEN:0:50}..."
echo "✅ Token saved to \$JWT_TOKEN"
```

---

### PHASE 6: TESTING (10 minutes)

#### Step 17: Run Test Suite
```bash
cd /Users/kavyapatel/Desktop/ai-video-platform

# Run all 19 API tests
bash scripts/test-api.sh $JWT_TOKEN

# Expected output:
# ✓ PASS: Create Comment (HTTP 201)
# ✓ PASS: Get Comments (HTTP 200)
# ✓ PASS: Like Video (HTTP 201)
# ✓ PASS: Unlike Video (HTTP 200)
# ✓ PASS: Rate Video (HTTP 201)
# ✓ PASS: Follow User (HTTP 201)
# ✓ PASS: Unfollow User (HTTP 200)
# ... (12 more tests)
# ✓ PASS: Bulk Events (performance test)

# All tests should show: ✓ PASS
```

#### Step 18: Run Integration Test
```bash
bash scripts/integration-test.sh $JWT_TOKEN

# Expected output:
# === INTEGRATION TEST SUITE ===
# Test 1: Complete video workflow
#   - Simulating video upload: test-video-xxxxx
#   - Posting comment: ...
#   - Starting watch session: ...
#   - Simulating watch events: ...
#   - Rating and liking: ...
#   - Fetching analytics: ...
# ✓ Integration test passed!
```

#### Step 19: Run Load Test
```bash
bash scripts/load-test.sh $JWT_TOKEN 5 50

# Expected output:
# Performance Test: 5 concurrent users, 50 iterations each
# Results:
#   Total time: 35s
#   Total requests: 750
#   Requests/sec: 21
#   Avg time/request: 46ms
```

---

### PHASE 7: FRONTEND TESTING (5 minutes)

#### Step 20: Test Frontend UI
```bash
# Open browser to http://localhost:5173
# Expected flow:

# 1. See login page
# 2. Click "Login" button
# 3. Enter: testuser@example.com / TestPassword123!
# 4. Redirected to Dashboard
# 5. See video grid (empty initially)
# 6. Click "Upload Video" button
# 7. Can drag-drop file or select from computer
# 8. Can enter video title
# 9. Click "Upload"
# 10. Progress bar shows upload status
# 11. Redirected back to Dashboard
# 12. New video appears in grid
# 13. Click video card
# 14. Redirected to Watch page
# 15. See:
#     - Video player placeholder
#     - Title and metadata
#     - Comment section
#     - Like button (heart)
#     - 5-star rating widget
#     - Analytics dashboard
#     - "Report Content" button
#     - Recommendations panel
```

---

### PHASE 8: MONITORING SETUP (5 minutes)

#### Step 21: Check CloudWatch Logs
```bash
# Watch Lambda logs in real-time
aws logs tail /aws/lambda --follow --region ap-south-1

# In another terminal, watch API Gateway logs
aws logs tail /aws/apigateway --follow --region ap-south-1

# View errors only
aws logs filter-log-events \
  --log-group-name /aws/lambda \
  --filter-pattern "ERROR" \
  --region ap-south-1
```

#### Step 22: View CloudWatch Metrics
```bash
# Lambda invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --region ap-south-1

# DynamoDB capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedWriteCapacityUnits \
  --dimensions Name=TableName,Value=VideoTable \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --region ap-south-1
```

---

## ✅ DEPLOYMENT CHECKLIST

After completing all phases, verify:

- [ ] **Phase 1**: All environment variables verified
- [ ] **Phase 2**: All 8 CloudFormation stacks deployed successfully
- [ ] **Phase 3**: API endpoint extracted and saved
- [ ] **Phase 4**: Frontend dependencies installed
- [ ] **Phase 5**: Test user created and JWT token obtained
- [ ] **Phase 6**: All 19 tests PASS
- [ ] **Phase 6**: Integration test completes successfully
- [ ] **Phase 6**: Load test shows acceptable performance
- [ ] **Phase 7**: Frontend UI loads without errors
- [ ] **Phase 7**: Can login with test user
- [ ] **Phase 7**: Can create/view/interact with videos
- [ ] **Phase 8**: CloudWatch logs show normal operation
- [ ] **Phase 8**: No errors in Lambda logs
- [ ] **Phase 8**: DynamoDB metrics show successful writes

---

## 📊 EXPECTED RESULTS

### Test Suite Results (19 Tests)
```
SOCIAL FEATURES (7)
✓ PASS: Create Comment (HTTP 201)
✓ PASS: Get Comments (HTTP 200)
✓ PASS: Like Video (HTTP 201)
✓ PASS: Unlike Video (HTTP 200)
✓ PASS: Rate Video (HTTP 201)
✓ PASS: Follow User (HTTP 201)
✓ PASS: Unfollow User (HTTP 200)

ANALYTICS (5)
✓ PASS: Track Watch Session (HTTP 201)
✓ PASS: Track Engagement (Play) (HTTP 201)
✓ PASS: Track Engagement (Pause) (HTTP 201)
✓ PASS: Track Engagement (Skip) (HTTP 201)
✓ PASS: Get Video Analytics (HTTP 200)

ADMIN (2)
✓ PASS: Create Violation Report (HTTP 201)
⚠ EXPECTED: Get Audit Logs requires admin role (HTTP 403)

ERROR CASES (4)
✓ PASS: Reject Invalid Rating (HTTP 400)
✓ PASS: Reject Invalid Event Type (HTTP 400)
✓ PASS: Reject Empty Comment (HTTP 400)
✓ PASS: Prevent Duplicate Like (HTTP 409)

PERFORMANCE (1)
✓ PASS: Bulk Events - Total: 500ms, Avg: 50ms per event

Summary: 18/19 tests PASS (1 expected failure: 403 for non-admin)
```

### Frontend Load
```
http://localhost:5173/
✓ Page loads in <2 seconds
✓ Authenticator component visible
✓ Login button clickable
✓ Google OAuth redirect works
✓ Dashboard loads after login
✓ Video grid displays
✓ Upload button functional
✓ All components render without console errors
```

### CloudWatch Metrics
```
Lambda:
✓ Invocations: 50-100/minute (normal load test)
✓ Errors: 0-5 (expected from error case tests)
✓ Duration: 50-600ms (varies by function)
✓ Throttles: 0 (good sign)

DynamoDB:
✓ ConsumedWriteCapacityUnits: 5-20/minute
✓ ConsumedReadCapacityUnits: 10-30/minute
✓ UserErrors: 0 (good sign)
✓ SystemErrors: 0 (good sign)

API Gateway:
✓ 4xx Errors: <5% (validation errors)
✓ 5xx Errors: 0 (no server errors)
✓ Latency P50: 200ms
✓ Latency P99: 800ms
```

---

## 🚨 COMMON ISSUES & SOLUTIONS

### Issue 1: "Missing MediaConvert endpoint"
```bash
# Error: Missing MediaConvert endpoint. Set MEDIACONVERT_ENDPOINT...

# Solution:
export MEDIACONVERT_ENDPOINT="https://mediaconvert.ap-south-1.amazonaws.com"
npx cdk deploy ApiStack --require-approval=never
```

### Issue 2: "Stack already exists"
```bash
# Error: Resource already exists or ROLLBACK_COMPLETE status

# Solution:
# Wait for previous deployment to complete or:
aws cloudformation delete-stack --stack-name ApiStack --region ap-south-1
aws cloudformation wait stack-delete-complete --stack-name ApiStack --region ap-south-1
npx cdk deploy ApiStack --require-approval=never
```

### Issue 3: "401 Unauthorized" in tests
```bash
# Error: All API tests return 401

# Solution:
# 1. Get fresh JWT token:
export JWT_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id $CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPassword123! \
  --region ap-south-1 \
  --query 'AuthenticationResult.AccessToken' \
  --output text)

# 2. Run tests again:
bash scripts/test-api.sh $JWT_TOKEN
```

### Issue 4: "CloudFront distribution stuck in PROGRESS"
```bash
# Solution: Wait 5-10 minutes for propagation
# Check status:
aws cloudfront get-distribution --id <id> --region ap-south-1 \
  --query 'Distribution.Status'

# Should eventually show: Deployed
```

### Issue 5: "Frontend shows blank page"
```bash
# Solution:
# 1. Check .env file exists:
cat frontend/.env

# 2. Verify API_URL is correct:
echo $API_ENDPOINT

# 3. Check browser console for errors (F12)
# 4. Hard refresh (Cmd+Shift+R on Mac)
# 5. Clear browser cache if needed
```

### Issue 6: "Lambda timeout"
```bash
# Solution:
# 1. Increase timeout in infra/lib/stacks/api-stack.js:
# Change: timeout: Duration.seconds(30)
# To: timeout: Duration.seconds(60)

# 2. Redeploy:
npx cdk deploy ApiStack --require-approval=never

# 3. Check CloudWatch logs for slow operations
```

---

## 💰 COST ESTIMATION

**First Month Estimates** (with Free Tier):

| Service | Usage | Cost |
|---------|-------|------|
| Lambda | 100K invocations | $0.20 |
| DynamoDB | On-demand 100 GB | $1.25 |
| S3 | 100 GB storage | $2.30 |
| CloudFront | 500 GB transfer | $8.50 |
| API Gateway | 1M requests | $3.50 |
| Cognito | 50K MAU | Free (first year) |
| **TOTAL** | | **~$16** |

*Free tier covers first 1M Lambda invocations, 25GB DynamoDB, 5GB S3*

---

## 📚 DOCUMENTATION REFERENCES

1. **SYSTEM_ARCHITECTURE.md** - Complete system diagram
2. **QUICK_START.md** - 5-minute setup guide
3. **API_REFERENCE.md** - 26 endpoint reference
4. **DEPLOYMENT_GUIDE.md** - Detailed deployment steps
5. **STEP_BY_STEP_DEPLOYMENT.md** - This document

---

## 🎯 SUCCESS CRITERIA

✅ **All deployments successful**
- 8 CloudFormation stacks deployed
- No ROLLBACK_COMPLETE stacks
- All outputs available

✅ **All tests passing**
- 19/19 API tests pass
- Integration test completes
- Load test shows good performance

✅ **Frontend working**
- Loads without errors
- Can login with test user
- Can upload/view/interact with videos

✅ **Monitoring active**
- CloudWatch logs show operations
- X-Ray tracing enabled
- Alarms configured

---

## 🚀 READY TO DEPLOY?

**Start here:**

```bash
# 1. Set environment
export MEDIACONVERT_ENDPOINT="https://mediaconvert.ap-south-1.amazonaws.com"

# 2. Deploy all stacks
cd /Users/kavyapatel/Desktop/ai-video-platform/infra
npx cdk deploy --all --require-approval=never --region ap-south-1

# 3. Wait 15-25 minutes...

# 4. Extract outputs and configure frontend
export API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name ApiStack --region ap-south-1 --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)
echo "VITE_API_URL=$API_ENDPOINT" > ../frontend/.env

# 5. Start frontend
cd ../frontend
npm install
npm run dev

# 6. Test
bash ../scripts/test-api.sh $JWT_TOKEN

# Done! 🎉
```

**Total Time**: ~45-60 minutes  
**Difficulty**: Medium  
**Prerequisites**: AWS account, Node.js, npm

---

**Status**: 🟢 **READY FOR DEPLOYMENT**

Next step: Execute the commands above!
