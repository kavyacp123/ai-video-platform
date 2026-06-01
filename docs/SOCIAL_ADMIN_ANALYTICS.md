# Social, Admin & Analytics Features Implementation

## Overview

This document outlines the newly implemented features for your AI video platform:
- **Social Features**: Comments, likes, ratings, follows
- **Admin & Compliance**: Audit logging, violation reports, permissions
- **Analytics**: Watch tracking, engagement metrics, video performance

## Database Schema Extensions

### Social Features

```
COMMENT#${videoId}
  ├── ${timestamp}#${commentId}
  ├── text, userId, userName, likes, status
  └── GSI1: COMMENT#${videoId} (by timestamp)

LIKE#${videoId}
  ├── ${userId}
  └── GSI1: USER#${userId}#LIKE#${timestamp}

RATING#${videoId}
  ├── ${userId}
  ├── rating (1-5)
  └── GSI1: VIDEO#${videoId}#RATING#${rating}

FOLLOW#${userId}
  ├── ${targetUserId}
  └── GSI1: FOLLOWERS#${targetUserId}#${timestamp}
```

### Admin & Compliance

```
AUDIT#${date}
  ├── ${timestamp}#${logId}
  ├── userId, action, resource, status
  └── GSI1: AUDIT#${userId}#${timestamp}
  └── GSI2: AUDIT#${action}#${timestamp}

VIOLATION#${videoId}
  ├── ${timestamp}#${reportId}
  ├── reporterUserId, reason, status
  └── GSI1: VIOLATIONS#PENDING#${timestamp}

PERMISSION#${userId}
  ├── ROLE
  ├── role, permissions[]
  └── Default: { role: "user", permissions: ["read_own_videos", "upload_videos", "comment"] }
```

### Analytics

```
WATCH#${videoId}
  ├── ${timestamp}#${sessionId}
  ├── userId, position, duration
  └── GSI1: USER#${userId}#WATCH#${timestamp}
  └── GSI2: ENGAGEMENT#${videoId}#${timestamp}

ENGAGEMENT#${videoId}
  ├── ${timestamp}#${eventId}
  ├── userId, eventType (play/pause/skip/replay), position
  └── GSI1: USER#${userId}#ENGAGEMENT#${timestamp}
```

## API Endpoints

### Social Endpoints

```
POST   /videos/{id}/comments           Create a comment
GET    /videos/{id}/comments           Get all comments for a video
POST   /videos/{id}/like              Like a video
DELETE /videos/{id}/like              Unlike a video
POST   /videos/{id}/rate              Rate a video (1-5)
POST   /users/{userId}/follow         Follow a user
DELETE /users/{userId}/follow         Unfollow a user
```

### Analytics Endpoints

```
POST /videos/{id}/watch-session       Track watch session start
POST /videos/{id}/engagement          Track engagement event
GET  /videos/{id}/analytics           Get video analytics
```

### Admin Endpoints

```
POST /videos/{id}/report-violation    Report a content violation
GET  /admin/audit-logs                Get audit logs for a user
```

## Lambda Functions Created

### Social Functions
- `functions/create-comment/index.js` - Create comment
- `functions/get-comments/index.js` - Fetch comments
- `functions/like-video/index.js` - Like/Unlike video
- `functions/rate-video/index.js` - Rate video
- `functions/follow-user/index.js` - Follow/Unfollow user

### Analytics Functions
- `functions/track-watch-session/index.js` - Start watch session
- `functions/track-engagement/index.js` - Track engagement event
- `functions/get-video-analytics/index.js` - Get video analytics

### Admin Functions
- `functions/create-violation-report/index.js` - Report violation
- `functions/get-audit-logs/index.js` - Get audit logs

## React Components

### Social Components

#### `CommentSection`
Display and manage video comments.
```jsx
import { CommentSection } from './components/CommentSection.jsx';

<CommentSection videoId={videoId} />
```

#### `VideoRatings`
5-star rating system for videos.
```jsx
import { VideoRatings } from './components/VideoRatings.jsx';

<VideoRatings videoId={videoId} />
```

#### `LikeButton`
Like/Unlike button for videos.
```jsx
import { LikeButton } from './components/LikeButton.jsx';

<LikeButton videoId={videoId} />
```

#### `FollowButton`
Follow/Unfollow button for users.
```jsx
import { FollowButton } from './components/FollowButton.jsx';

<FollowButton userId={creatorUserId} />
```

### Analytics Components

#### `EngagementTracker`
Hook for tracking user engagement.
```jsx
import { EngagementTracker } from './components/EngagementTracker.jsx';

const engagement = EngagementTracker({ videoId, videoDuration });
engagement.trackPlay(position);
engagement.trackPause(position);
engagement.trackSkip(position);
engagement.trackReplay(position);
```

#### `VideoAnalyticsDashboard`
Display video analytics and metrics.
```jsx
import { VideoAnalyticsDashboard } from './components/VideoAnalyticsDashboard.jsx';

<VideoAnalyticsDashboard videoId={videoId} />
```

### Admin Components

#### `ViolationReportDialog`
Modal dialog for reporting content violations.
```jsx
import { ViolationReportDialog } from './components/ViolationReportDialog.jsx';

{showReportDialog && (
  <ViolationReportDialog 
    videoId={videoId} 
    onClose={() => setShowReportDialog(false)} 
  />
)}
```

#### `AdminDashboard`
Admin interface for viewing audit logs.
```jsx
import { AdminDashboard } from './components/AdminDashboard.jsx';

<AdminDashboard />
```

### Complete Example

#### `VideoWatch`
Complete video watch page with all social and analytics features.
```jsx
import { VideoWatch } from './components/VideoWatch.jsx';

<VideoWatch 
  videoId={videoId}
  videoTitle={title}
  creatorUserId={userId}
  videoDuration={duration}
/>
```

## Deployment Steps

### 1. Deploy DynamoDB Schema
The extensions are automatically handled by the existing single-table design. No schema migration needed.

### 2. Deploy Lambda Functions
```bash
cd infra
npx cdk deploy ApiStack
```

This will deploy all new Lambda functions with proper IAM permissions.

### 3. Update Frontend Build
```bash
cd frontend
npm install
npm run build
```

### 4. Set Up Permissions
Create admin users with enhanced permissions:
```javascript
const { setUserPermission } = require('../shared/dynamoService.js');

await setUserPermission({
  userId: 'admin-user-id',
  role: 'admin',
  permissions: [
    'read_own_videos',
    'upload_videos',
    'comment',
    'view_audit_logs',
    'manage_violations',
    'manage_users'
  ]
});
```

## Usage Examples

### Posting a Comment
```javascript
const response = await fetch(`${API_URL}/videos/${videoId}/comments`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ text: 'Great video!' })
});
```

### Tracking Watch Session
```javascript
const response = await fetch(`${API_URL}/videos/${videoId}/watch-session`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    startTime: new Date().toISOString(),
    position: 0,
    duration: 300  // 5 minutes
  })
});
```

### Tracking Engagement
```javascript
await fetch(`${API_URL}/videos/${videoId}/engagement`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    eventType: 'pause',  // play, pause, skip, replay, seek, quality_change
    position: 150
  })
});
```

### Getting Video Analytics
```javascript
const analytics = await fetch(`${API_URL}/videos/${videoId}/analytics`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

console.log(analytics);
// {
//   videoId: 'vid-123',
//   totalWatches: 150,
//   totalLikes: 25,
//   totalRatings: 10,
//   averageRating: 4.2,
//   engagementBreakdown: {
//     plays: 160,
//     pauses: 45,
//     skips: 12,
//     replays: 8
//   }
// }
```

### Reporting a Violation
```javascript
const response = await fetch(`${API_URL}/videos/${videoId}/report-violation`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    reason: 'hate_speech',
    description: 'This video contains offensive language'
  })
});
```

## Data Retention

- **Comments**: 5 years (TTL: 5 * 365 * 24 * 60 * 60 seconds)
- **Likes/Follows**: 5 years
- **Watch Sessions/Engagement**: 1 year
- **Audit Logs**: 1 year
- **Violation Reports**: 6 months

## Future Enhancements

1. **Moderation Queue**: Admin interface for reviewing flagged content
2. **User Recommendations**: ML-based video suggestions
3. **Advanced Analytics**: Heatmaps, retention curves, audience demographics
4. **Social Graph**: Recommended users to follow
5. **Trending Videos**: Real-time trending calculation
6. **Notification System**: Notify users of new comments, follows, etc.
7. **Content Scheduling**: Schedule video publication
8. **Multi-language Support**: Auto-translate comments
9. **Engagement Metrics**: Track watch time, completion rate
10. **Compliance Reports**: GDPR data export, deletion
