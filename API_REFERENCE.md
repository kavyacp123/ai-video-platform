# API Quick Reference

## Base URL
```
https://xxxxx.execute-api.{region}.amazonaws.com
```

## Authentication
All requests require JWT token:
```
Authorization: Bearer {jwt_token}
```

## Endpoints

### Social Features

#### Comments
```bash
# Create comment
POST /videos/{id}/comments
{
  "text": "Great video!"
}

# Get comments (paginated)
GET /videos/{id}/comments?limit=50&lastKey=cursor
```

#### Likes
```bash
# Like video
POST /videos/{id}/like

# Unlike video  
DELETE /videos/{id}/like
```

#### Ratings
```bash
# Rate video (1-5 stars)
POST /videos/{id}/rate
{
  "rating": 5
}
```

#### Following
```bash
# Follow user
POST /users/{userId}/follow

# Unfollow user
DELETE /users/{userId}/follow
```

### Analytics

#### Watch Sessions
```bash
# Start watch session
POST /videos/{id}/watch-session
{
  "startTime": "2024-01-01T12:00:00Z",
  "position": 0,
  "duration": 300
}
```

#### Engagement
```bash
# Track engagement event
POST /videos/{id}/engagement
{
  "eventType": "play|pause|skip|replay|seek",
  "position": 120,
  "metadata": {}
}
```

#### Analytics
```bash
# Get video analytics
GET /videos/{id}/analytics

Response:
{
  "videoId": "...",
  "totalWatches": 100,
  "totalLikes": 25,
  "totalRatings": 15,
  "averageRating": 4.5,
  "totalEngagementEvents": 500,
  "engagementBreakdown": {
    "plays": 300,
    "pauses": 100,
    "skips": 50,
    "replays": 50
  }
}
```

### Admin & Compliance

#### Violation Reports
```bash
# Report video violation
POST /videos/{id}/report-violation
{
  "reason": "spam|hate_speech|violent_content|copyright|misinformation|sexual_content|other",
  "description": "Details about the violation"
}
```

#### Audit Logs
```bash
# Get audit logs (admin only)
GET /admin/audit-logs?userId={userId}&action={action}&limit=50

Response (403 if not admin):
{
  "logs": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "userId": "...",
      "action": "CREATE_COMMENT|LIKE_VIDEO|RATE_VIDEO|etc",
      "resourceId": "...",
      "status": "success|error"
    }
  ]
}
```

### Advanced Features

#### Recommendations
```bash
# Get recommended videos
GET /videos/{id}/recommendations?userId={userId}&limit=6

Response:
{
  "videoId": "...",
  "recommendations": [
    {
      "videoId": "...",
      "title": "...",
      "similarity": 85,
      "reason": "Users who watched this also watched..."
    }
  ]
}
```

#### Notifications
```bash
# Send notification
POST /notifications/send
{
  "userId": "...",
  "targetUserId": "...",
  "notificationType": "comment_reply|new_follower|video_like|video_featured",
  "data": {
    "text": "Comment text",
    "title": "Video title"
  }
}
```

#### Heatmap
```bash
# Get viewer heatmap
GET /videos/{id}/heatmap?resolution=full

Response:
{
  "videoId": "...",
  "heatmap": {
    "0": { "plays": 150, "pauses": 30, "skips": 5 },
    "10": { "plays": 120, "pauses": 25, "skips": 10 },
    "20": { "plays": 90, "pauses": 20, "skips": 25 }
  },
  "stats": {
    "totalEvents": 1200,
    "retention": { "0": 100, "10": 80, "20": 60 }
  }
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Missing or invalid JWT |
| 403 | Forbidden - Access denied (e.g., not admin) |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Duplicate (e.g., already liked) |
| 500 | Internal Server Error |

## Example cURL Requests

### Create Comment
```bash
curl -X POST \
  https://xxxxx.execute-api.us-east-1.amazonaws.com/videos/my-video/comments \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Awesome video!"}'
```

### Get Analytics
```bash
curl -X GET \
  https://xxxxx.execute-api.us-east-1.amazonaws.com/videos/my-video/analytics \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Track Engagement
```bash
curl -X POST \
  https://xxxxx.execute-api.us-east-1.amazonaws.com/videos/my-video/engagement \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventType": "play", "position": 0}'
```

### Get Recommendations
```bash
curl -X GET \
  "https://xxxxx.execute-api.us-east-1.amazonaws.com/videos/my-video/recommendations?userId=user-1&limit=6" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## Common Errors

### 400: Invalid Rating
```json
{
  "error": "Rating must be between 1 and 5"
}
```

### 400: Empty Comment
```json
{
  "error": "Comment text is required"
}
```

### 409: Already Liked
```json
{
  "error": "You have already liked this video"
}
```

### 403: Not Admin
```json
{
  "error": "Admin access required"
}
```

## Response Times (Expected)

- Comment creation: 100-200ms
- Get comments: 200-400ms
- Engagement tracking: 50-100ms
- Analytics: 300-600ms
- Recommendations: 500-1500ms
- Heatmap: 400-800ms

## Rate Limits

No explicit rate limiting yet, but recommendations:
- Comment: 100/minute per user
- Engagement: 1000/minute per user
- Analytics queries: 10/minute per user

## Data Retention

- Comments: 1 year
- Likes/Ratings: 5 years
- Audit logs: 1 year
- Engagement events: Auto-cleanup via TTL
- Notifications: 30 days
- Heatmaps: 1 year
