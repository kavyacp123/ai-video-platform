# 🚀 DEPLOYMENT EXECUTION PLAN

**Last Updated**: June 1, 2026  
**Status**: 🟢 **READY FOR DEPLOYMENT**  
**Time Estimate**: 45-60 minutes total

---

## 📊 CURRENT STATE

### ✅ COMPLETED
- [x] 14 Lambda functions (fully coded)
- [x] 11 React components (fully coded)
- [x] 3 Frontend pages (fully coded)
- [x] 26 API endpoints (configured)
- [x] DynamoDB schema (optimized)
- [x] Test suite (19 tests)
- [x] Documentation (7 guides)
- [x] AWS credentials (verified: account 788184849410)
- [x] Google OAuth (configured)
- [x] Node.js environment (v25.6.0)

### ⏳ PENDING

**Phase 1 - Pre-Deployment (10 min)**
1. [ ] Export MEDIACONVERT_ENDPOINT
2. [ ] Verify all code files present

**Phase 2 - CDK Deployment (20 min)**
3. [ ] Run CDK synth
4. [ ] Deploy 8 CloudFormation stacks

**Phase 3 - Configuration (5 min)**
5. [ ] Extract API endpoint
6. [ ] Extract Cognito credentials
7. [ ] Create frontend .env

**Phase 4 - Frontend Setup (10 min)**
8. [ ] npm install
9. [ ] npm run dev

**Phase 5 - Testing (15 min)**
10. [ ] Create test user
11. [ ] Get JWT token
12. [ ] Run test-api.sh
13. [ ] Run integration tests

---

## 🎯 EXACT COMMANDS TO RUN

### Step 1: Set Environment (1 min)
```bash
export MEDIACONVERT_ENDPOINT="https://mediaconvert.ap-south-1.amazonaws.com"
echo $MEDIACONVERT_ENDPOINT  # Verify it's set
```

### Step 2: Navigate to Project
```bash
cd /Users/kavyapatel/Desktop/ai-video-platform/infra
pwd  # Verify correct directory
```

### Step 3: Verify Code Files
```bash
# Check Lambda functions
ls ../functions/*/index.js | wc -l
# Expected: 14 ✅

# Check React components  
ls ../frontend/src/components/*.jsx | wc -l
# Expected: 11 ✅

# Check frontend pages
ls ../frontend/src/pages/*.jsx | wc -l
# Expected: 3 ✅

# Check test scripts
ls -la ../scripts/*.sh | grep rwx | wc -l
# Expected: 3 ✅
```

### Step 4: Deploy Infrastructure (20 min)
```bash
# ONE COMMAND - Deploys all 8 stacks in correct order
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

# ⏱️ This will take 15-25 minutes
# 📊 Watch the output for progress
# 🟢 Should see "CloudFormation outputs:" at the end
```

### Step 5: Verify Deployment (2 min)
```bash
# Check all stacks
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE \
  --region ap-south-1 \
  --query 'StackSummaries[*].StackName' \
  --output table

# Should show all 8 stacks ✅
```

### Step 6: Extract Configuration (2 min)
```bash
# Get API endpoint
export API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ApiStack \
  --region ap-south-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

echo "API: $API_ENDPOINT"

# Get Cognito credentials
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

echo "Pool: $USER_POOL_ID"
echo "Client: $CLIENT_ID"
```

### Step 7: Configure Frontend (3 min)
```bash
# Create .env file
cat > /Users/kavyapatel/Desktop/ai-video-platform/frontend/.env << EOF
VITE_API_URL=$API_ENDPOINT
VITE_REGION=ap-south-1
VITE_USER_POOL_ID=$USER_POOL_ID
VITE_CLIENT_ID=$CLIENT_ID
EOF

# Verify
cat /Users/kavyapatel/Desktop/ai-video-platform/frontend/.env
```

### Step 8: Setup Frontend (5 min)
```bash
cd /Users/kavyapatel/Desktop/ai-video-platform/frontend

# Install dependencies
npm install

# Verify
npm list react aws-amplify | head -3
```

### Step 9: Start Frontend (1 min)
```bash
# Start development server
npm run dev

# Output: ➜  Local:   http://localhost:5173/
# Keep this terminal open
```

### Step 10: Create Test User (2 min)
**In NEW terminal:**
```bash
# Set variables from previous steps
export USER_POOL_ID="ap-south-1_xxxxx"
export CLIENT_ID="xxxxx.apps.googleusercontent.com"
export REGION="ap-south-1"

# Create user
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username testuser@example.com \
  --message-action SUPPRESS \
  --temporary-password TempPassword123! \
  --region $REGION

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username testuser@example.com \
  --password TestPassword123! \
  --permanent \
  --region $REGION

echo "✅ User created: testuser@example.com / TestPassword123!"
```

### Step 11: Get JWT Token (2 min)
```bash
# Get JWT token
export JWT_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id $CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPassword123! \
  --region $REGION \
  --query 'AuthenticationResult.AccessToken' \
  --output text)

echo "🔐 Token: ${JWT_TOKEN:0:30}..."
# Save this token - you'll need it for testing
```

### Step 12: Run Tests (5 min)
```bash
cd /Users/kavyapatel/Desktop/ai-video-platform

# Run all 19 tests
bash scripts/test-api.sh $JWT_TOKEN

# Expected: 18 PASS ✓, 1 expected 403 (admin-only) ⚠

# If all pass, run integration test
bash scripts/integration-test.sh $JWT_TOKEN

# Expected: Test passed ✓
```

### Step 13: Test Frontend (2 min)
```bash
# Open browser to http://localhost:5173

# 1. See login page
# 2. Click "Login with Google" or regular login
# 3. Enter: testuser@example.com / TestPassword123!
# 4. Should be redirected to Dashboard
# 5. See empty video grid
# 6. Click "Upload Video"
# 7. Test upload workflow

# ✅ Success if everything works!
```

---

## 📋 QUICK REFERENCE - What Gets Deployed

| Component | Purpose | Status |
|-----------|---------|--------|
| **StorageStack** | DynamoDB + S3 | Will deploy |
| **AuthStack** | Cognito + OAuth | Will deploy |
| **EventStack** | EventBridge | Will deploy |
| **DeliveryStack** | CloudFront CDN | Will deploy |
| **PipelineStack** | Video processing | Will deploy |
| **CustomTranscoderStack** | FFmpeg Lambda | Will deploy |
| **ApiStack** | HTTP API + 26 endpoints | Will deploy ⭐ |
| **HardeningStack** | Monitoring + alarms | Will deploy |

---

## ✅ SUCCESS INDICATORS

### After CDK Deploy
- [ ] 8 stacks show CREATE_COMPLETE
- [ ] 0 failed stacks
- [ ] API endpoint looks like: `https://xxxxx.execute-api.ap-south-1.amazonaws.com`
- [ ] No errors in console

### After Frontend Setup
- [ ] http://localhost:5173 loads
- [ ] Login page visible
- [ ] No console errors (F12)
- [ ] Can login with testuser@example.com

### After Tests
- [ ] `bash test-api.sh`: 18/19 tests PASS ✓
- [ ] `bash integration-test.sh`: Completes successfully ✓
- [ ] `bash load-test.sh`: Shows performance metrics ✓

---

## 🚨 If Something Goes Wrong

### "Missing MediaConvert endpoint"
```bash
# Make sure to export BEFORE deploy:
export MEDIACONVERT_ENDPOINT="https://mediaconvert.ap-south-1.amazonaws.com"
npx cdk deploy ApiStack --require-approval=never
```

### "Stack already exists / CREATE_FAILED"
```bash
# Delete and retry:
aws cloudformation delete-stack --stack-name ApiStack --region ap-south-1
aws cloudformation wait stack-delete-complete --stack-name ApiStack --region ap-south-1
npx cdk deploy ApiStack --require-approval=never
```

### "401 Unauthorized" in tests
```bash
# Refresh JWT token:
export JWT_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id $CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPassword123! \
  --region ap-south-1 \
  --query 'AuthenticationResult.AccessToken' \
  --output text)
bash scripts/test-api.sh $JWT_TOKEN
```

### "Frontend shows blank"
```bash
# Check .env and restart:
cat frontend/.env
cd frontend
npm run dev  # Restart dev server
```

---

## 📊 TIMELINE

| Phase | Steps | Time |
|-------|-------|------|
| 1. Pre-Deploy | Export env, verify files | 5 min |
| 2. CDK Deploy | Synthesize + deploy 8 stacks | 20-25 min |
| 3. Config | Extract outputs, setup .env | 5 min |
| 4. Frontend | npm install + npm run dev | 10 min |
| 5. Testing | Create user, run tests | 10 min |
| **TOTAL** | | **50-55 min** |

---

## 🎯 NEXT ACTION

**Run this command right now:**

```bash
export MEDIACONVERT_ENDPOINT="https://mediaconvert.ap-south-1.amazonaws.com"
cd /Users/kavyapatel/Desktop/ai-video-platform/infra
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
```

Then follow the steps above in order. ✅

---

**Expected Result**: 
- ✅ Full AI Video Platform deployed
- ✅ 26 API endpoints live
- ✅ Frontend working
- ✅ All tests passing
- ✅ Ready for users!

🚀 **Let's deploy!**
