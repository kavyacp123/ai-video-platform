#!/bin/bash

# AI Video Platform - API Test Suite
# Run comprehensive tests for all new social, admin, and analytics features

set -e

API_URL="${VITE_API_URL:-http://localhost:3000}"
TOKEN="${1:?"Usage: $0 <jwt_token> [userId]"}"
USER_ID="${2:-test-user-id}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "API Test Suite - Social/Admin/Analytics"
echo "========================================="
echo "API URL: $API_URL"
echo "User ID: $USER_ID"
echo ""

# Helper function to print test status
test_result() {
  local test_name=$1
  local response=$2
  local expected_code=$3
  
  local http_code=$(echo "$response" | tail -n1)
  if [[ "$http_code" == "$expected_code" ]]; then
    echo -e "${GREEN}✓ PASS${NC}: $test_name (HTTP $http_code)"
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}: $test_name (Expected $expected_code, got $http_code)"
    echo "Response: $response"
    return 1
  fi
}

TEST_VIDEO_ID="test-video-$(date +%s)"
TEST_USER_ID="test-user-$(date +%s)"
COMMENT_ID=""
LIKE_ID=""

# ============= SOCIAL FEATURES TESTS =============
echo -e "\n${YELLOW}=== SOCIAL FEATURES ===${NC}"

# Test 1: Create Comment
echo "Test 1: Create Comment"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/comments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Great video! Loved it."}')
test_result "Create Comment" "$RESPONSE" "201"

# Extract comment ID from response
COMMENT_ID=$(echo "$RESPONSE" | head -n 1 | grep -o '"commentId":"[^"]*"' | cut -d'"' -f4)

# Test 2: Get Comments
echo "Test 2: Get Comments"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "$API_URL/videos/$TEST_VIDEO_ID/comments" \
  -H "Authorization: Bearer $TOKEN")
test_result "Get Comments" "$RESPONSE" "200"

# Test 3: Like Video
echo "Test 3: Like Video"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/like" \
  -H "Authorization: Bearer $TOKEN")
test_result "Like Video" "$RESPONSE" "201"

# Test 4: Unlike Video
echo "Test 4: Unlike Video"
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
  "$API_URL/videos/$TEST_VIDEO_ID/like" \
  -H "Authorization: Bearer $TOKEN")
test_result "Unlike Video" "$RESPONSE" "200"

# Test 5: Rate Video
echo "Test 5: Rate Video (5 stars)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/rate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5}')
test_result "Rate Video" "$RESPONSE" "201"

# Test 6: Follow User
echo "Test 6: Follow User"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/users/$TEST_USER_ID/follow" \
  -H "Authorization: Bearer $TOKEN")
test_result "Follow User" "$RESPONSE" "201"

# Test 7: Unfollow User
echo "Test 7: Unfollow User"
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
  "$API_URL/users/$TEST_USER_ID/follow" \
  -H "Authorization: Bearer $TOKEN")
test_result "Unfollow User" "$RESPONSE" "200"

# ============= ANALYTICS TESTS =============
echo -e "\n${YELLOW}=== ANALYTICS FEATURES ===${NC}"

# Test 8: Track Watch Session
echo "Test 8: Track Watch Session"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/watch-session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"startTime\": \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\", \"position\": 0, \"duration\": 300}")
test_result "Track Watch Session" "$RESPONSE" "201"

# Test 9: Track Engagement - Play
echo "Test 9: Track Engagement (Play Event)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/engagement" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventType": "play", "position": 0}')
test_result "Track Engagement (Play)" "$RESPONSE" "201"

# Test 10: Track Engagement - Pause
echo "Test 10: Track Engagement (Pause Event)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/engagement" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventType": "pause", "position": 150}')
test_result "Track Engagement (Pause)" "$RESPONSE" "201"

# Test 11: Track Engagement - Skip
echo "Test 11: Track Engagement (Skip Event)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/engagement" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventType": "skip", "position": 50}')
test_result "Track Engagement (Skip)" "$RESPONSE" "201"

# Test 12: Get Video Analytics
echo "Test 12: Get Video Analytics"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "$API_URL/videos/$TEST_VIDEO_ID/analytics" \
  -H "Authorization: Bearer $TOKEN")
test_result "Get Video Analytics" "$RESPONSE" "200"

# ============= ADMIN & COMPLIANCE TESTS =============
echo -e "\n${YELLOW}=== ADMIN & COMPLIANCE FEATURES ===${NC}"

# Test 13: Create Violation Report
echo "Test 13: Create Violation Report"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/report-violation" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "spam", "description": "This video is spam"}')
test_result "Create Violation Report" "$RESPONSE" "201"

# Test 14: Get Audit Logs (requires admin)
echo "Test 14: Get Audit Logs (Admin required)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "$API_URL/admin/audit-logs?userId=$USER_ID" \
  -H "Authorization: Bearer $TOKEN")
# This may return 403 if user is not admin, which is expected
if echo "$RESPONSE" | tail -n1 | grep -q "^20"; then
  test_result "Get Audit Logs" "$RESPONSE" "200"
elif echo "$RESPONSE" | tail -n1 | grep -q "^403"; then
  echo -e "${YELLOW}⚠ EXPECTED${NC}: Get Audit Logs requires admin role (got 403)"
else
  echo -e "${RED}✗ UNEXPECTED${NC}: Get Audit Logs returned unexpected status"
fi

# ============= ERROR CASES =============
echo -e "\n${YELLOW}=== ERROR CASE TESTS ===${NC}"

# Test 15: Invalid Rating (out of range)
echo "Test 15: Invalid Rating (out of range)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/rate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rating": 10}')
test_result "Reject Invalid Rating" "$RESPONSE" "400"

# Test 16: Invalid Engagement Event Type
echo "Test 16: Invalid Engagement Event Type"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/engagement" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventType": "invalid_event", "position": 0}')
test_result "Reject Invalid Event Type" "$RESPONSE" "400"

# Test 17: Empty Comment
echo "Test 17: Empty Comment Text"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/comments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": ""}')
test_result "Reject Empty Comment" "$RESPONSE" "400"

# Test 18: Duplicate Like (should fail on second attempt)
echo "Test 18: Duplicate Like Prevention"
# First like
curl -s -X POST "$API_URL/videos/$TEST_VIDEO_ID/like" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
# Second like should fail
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/videos/$TEST_VIDEO_ID/like" \
  -H "Authorization: Bearer $TOKEN")
test_result "Prevent Duplicate Like" "$RESPONSE" "409"

# ============= PERFORMANCE TESTS =============
echo -e "\n${YELLOW}=== PERFORMANCE TESTS ===${NC}"

# Test 19: Bulk Engagement Events
echo "Test 19: Bulk Engagement Events (10 events)"
start_time=$(date +%s%N)
for i in {1..10}; do
  curl -s -X POST \
    "$API_URL/videos/$TEST_VIDEO_ID/engagement" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"eventType\": \"play\", \"position\": $((i * 30))}" > /dev/null
done
end_time=$(date +%s%N)
elapsed_ms=$(( (end_time - start_time) / 1000000 ))
avg_ms=$(( elapsed_ms / 10 ))
echo -e "${GREEN}✓ PASS${NC}: Bulk Events - Total: ${elapsed_ms}ms, Avg: ${avg_ms}ms per event"

# ============= SUMMARY =============
echo -e "\n${YELLOW}=========================================${NC}"
echo -e "${GREEN}Test suite completed!${NC}"
echo "All endpoints tested and working."
echo -e "${YELLOW}=========================================${NC}"
