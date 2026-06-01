#!/bin/bash

# Performance/Load Test
# Stress test the API with concurrent requests

API_URL="${VITE_API_URL:-http://localhost:3000}"
TOKEN="${1:?"Usage: $0 <jwt_token>"}"
CONCURRENT="${2:-10}"
ITERATIONS="${3:-100}"

echo "Performance Test: $CONCURRENT concurrent users, $ITERATIONS iterations each"
echo "API URL: $API_URL"
echo ""

# Function to run load
run_load() {
  local user_id=$1
  local user_token=$2
  
  for i in $(seq 1 $ITERATIONS); do
    VIDEO_ID="perf-test-user-$user_id"
    
    # Create comment
    curl -s -X POST "$API_URL/videos/$VIDEO_ID/comments" \
      -H "Authorization: Bearer $user_token" \
      -H "Content-Type: application/json" \
      -d '{"text": "Comment from user '$user_id'"}' > /dev/null
    
    # Track engagement
    curl -s -X POST "$API_URL/videos/$VIDEO_ID/engagement" \
      -H "Authorization: Bearer $user_token" \
      -H "Content-Type: application/json" \
      -d '{"eventType": "play", "position": '$(( $RANDOM % 300 ))'}' > /dev/null
    
    # Like video
    if [ $((i % 5)) -eq 0 ]; then
      curl -s -X POST "$API_URL/videos/$VIDEO_ID/like" \
        -H "Authorization: Bearer $user_token" > /dev/null 2>&1
    fi
    
    if [ $((i % 20)) -eq 0 ]; then
      echo "  User $user_id: $i/$ITERATIONS complete"
    fi
  done
}

# Run concurrent users
start_time=$(date +%s)
for user in $(seq 1 $CONCURRENT); do
  run_load $user "$TOKEN" &
done

wait
end_time=$(date +%s)

elapsed=$((end_time - start_time))
total_requests=$((CONCURRENT * ITERATIONS * 3))  # 3 requests per iteration

echo ""
echo "Results:"
echo "  Total time: ${elapsed}s"
echo "  Total requests: $total_requests"
echo "  Requests/sec: $(( total_requests / elapsed ))"
echo "  Avg time/request: $(( elapsed * 1000 / total_requests ))ms"
