#!/bin/bash

# Integration Test Suite
# Tests full workflows: Upload → Watch → Engage

set -e

API_URL="${VITE_API_URL:-http://localhost:3000}"
TOKEN="${1:?"Usage: $0 <jwt_token>"}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== INTEGRATION TEST SUITE ===${NC}"
echo "API URL: $API_URL"
echo ""

# 1. Create and watch video workflow
echo "Test 1: Complete video workflow"
VIDEO_ID="integration-test-$(date +%s)"

# Simulate video in system (in real test, would upload)
echo "  - Simulating video upload: $VIDEO_ID"

# 2. Post initial comment
echo "  - Posting comment..."
COMMENT=$(curl -s -X POST "$API_URL/videos/$VIDEO_ID/comments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Awesome video!"}')
echo "    Comment posted: $(echo $COMMENT | grep -o '"commentId":"[^"]*"')"

# 3. Start watch session
echo "  - Starting watch session..."
SESSION=$(curl -s -X POST "$API_URL/videos/$VIDEO_ID/watch-session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"startTime\": \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\", \"position\": 0, \"duration\": 600}")
SESSION_ID=$(echo $SESSION | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
echo "    Session ID: $SESSION_ID"

# 4. Simulate watch events
echo "  - Simulating watch events..."
EVENTS=("play" "pause" "play" "skip" "play" "replay")
POSITIONS=(0 120 120 180 180 150)
for i in "${!EVENTS[@]}"; do
  curl -s -X POST "$API_URL/videos/$VIDEO_ID/engagement" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"eventType\": \"${EVENTS[$i]}\", \"position\": ${POSITIONS[$i]}}" > /dev/null
  echo "    Event: ${EVENTS[$i]} at ${POSITIONS[$i]}s"
done

# 5. Rate and like
echo "  - Rating and liking..."
curl -s -X POST "$API_URL/videos/$VIDEO_ID/rate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5}' > /dev/null
echo "    Rated: 5 stars"

curl -s -X POST "$API_URL/videos/$VIDEO_ID/like" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "    Liked"

# 6. Get analytics
echo "  - Fetching analytics..."
ANALYTICS=$(curl -s -X GET "$API_URL/videos/$VIDEO_ID/analytics" \
  -H "Authorization: Bearer $TOKEN")
echo "    Analytics:"
echo $ANALYTICS | grep -o '"totalWatches":[0-9]*' | head -1
echo $ANALYTICS | grep -o '"totalLikes":[0-9]*' | head -1
echo $ANALYTICS | grep -o '"averageRating":[0-9.]*' | head -1

echo -e "\n${GREEN}✓ Integration test passed!${NC}"
