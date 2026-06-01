# Integration Guide: Social, Admin & Analytics Features

## Quick Start

### 1. Create a Video Watch Page

Create a new file `frontend/src/pages/WatchPage.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { VideoWatch } from '../components/VideoWatch.jsx';
import { api } from '../services/api.js';

export function WatchPage() {
  const { id } = useParams();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVideo();
  }, [id]);

  async function loadVideo() {
    try {
      const data = await api.getVideo(id);
      setVideo(data);
    } catch (error) {
      console.error('Failed to load video:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (!video) return <div>Video not found</div>;

  return (
    <VideoWatch
      videoId={id}
      videoTitle={video.title}
      creatorUserId={video.userId}
      videoDuration={video.duration}
    />
  );
}
```

### 2. Add Routes to Your App

Update `frontend/src/App.jsx`:

```jsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WatchPage } from './pages/WatchPage.jsx';
import { AdminDashboard } from './components/AdminDashboard.jsx';

function App() {
  return (
    <Router>
      <Routes>
        {/* Existing routes */}
        
        {/* New routes */}
        <Route path="/watch/:id" element={<WatchPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}
```

### 3. Update API Service

Add methods to `frontend/src/services/api.js`:

```javascript
export const api = {
  // ... existing methods ...

  // Social
  async createComment(videoId, text) {
    const headers = await getAuthHeaders();
    return fetch(`${API_URL}/videos/${videoId}/comments`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }).then(r => r.json());
  },

  async getComments(videoId) {
    const headers = await getAuthHeaders();
    return fetch(`${API_URL}/videos/${videoId}/comments`, { headers }).then(r => r.json());
  },

  async likeVideo(videoId) {
    const headers = await getAuthHeaders();
    return fetch(`${API_URL}/videos/${videoId}/like`, {
      method: 'POST',
      headers
    }).then(r => r.json());
  },

  async unlikeVideo(videoId) {
    const headers = await getAuthHeaders();
    return fetch(`${API_URL}/videos/${videoId}/like`, {
      method: 'DELETE',
      headers
    }).then(r => r.json());
  },

  // Analytics
  async trackWatchSession(videoId, startTime, duration) {
    const headers = await getAuthHeaders();
    return fetch(`${API_URL}/videos/${videoId}/watch-session`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime, position: 0, duration })
    }).then(r => r.json());
  },

  async trackEngagement(videoId, eventType, position) {
    const headers = await getAuthHeaders();
    return fetch(`${API_URL}/videos/${videoId}/engagement`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, position })
    }).then(r => r.json());
  },

  async getVideoAnalytics(videoId) {
    const headers = await getAuthHeaders();
    return fetch(`${API_URL}/videos/${videoId}/analytics`, { headers }).then(r => r.json());
  }
};
```

## Component Integration Examples

### Minimal Video Player with Comments

```jsx
import { CommentSection } from './components/CommentSection.jsx';
import { LikeButton } from './components/LikeButton.jsx';

function SimpleVideoPage({ videoId }) {
  return (
    <div>
      <h1>Video Title</h1>
      <div style={{ backgroundColor: '#000', aspectRatio: '16/9' }}>
        {/* Your HLS.js player here */}
      </div>
      
      <div style={{ marginTop: '2rem' }}>
        <LikeButton videoId={videoId} />
      </div>

      <CommentSection videoId={videoId} />
    </div>
  );
}
```

### Video with All Features

```jsx
import { VideoWatch } from './components/VideoWatch.jsx';

function FullVideoPage({ videoId, title, creatorId, duration }) {
  return (
    <VideoWatch 
      videoId={videoId}
      videoTitle={title}
      creatorUserId={creatorId}
      videoDuration={duration}
    />
  );
}
```

### Admin Dashboard Integration

```jsx
import { AdminDashboard } from './components/AdminDashboard.jsx';

function AdminPage() {
  // Check if user is admin before rendering
  return <AdminDashboard />;
}
```

## Deployment Checklist

### Backend Deployment

- [ ] Verify all Lambda functions are in `functions/` directory
- [ ] Ensure `shared/dynamoService.js` has all new methods
- [ ] Update `infra/lib/stacks/api-stack.js` with new routes
- [ ] Run: `cd infra && npx cdk deploy ApiStack`
- [ ] Test new endpoints with Postman/curl

### Frontend Deployment

- [ ] Copy all React components to `frontend/src/components/`
- [ ] Update `frontend/src/services/api.js` with new methods
- [ ] Add new routes to `frontend/src/App.jsx`
- [ ] Create new pages as needed
- [ ] Run: `cd frontend && npm run build`

### Testing Endpoints

```bash
# Test create comment
curl -X POST http://localhost:3000/videos/vid-123/comments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Great video!"}'

# Test like video
curl -X POST http://localhost:3000/videos/vid-123/like \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test track watch
curl -X POST http://localhost:3000/videos/vid-123/watch-session \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startTime": "2024-01-01T00:00:00Z", "position": 0, "duration": 300}'

# Test get analytics
curl -X GET http://localhost:3000/videos/vid-123/analytics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Environment Variables

Ensure your frontend has the correct API URL:

```bash
# .env or .env.local
VITE_API_URL=http://localhost:3000  # for local development
VITE_API_URL=https://api.example.com  # for production
```

## Performance Considerations

### Database Optimization

- **Comments**: Use pagination with `lastKey` to limit results
- **Analytics**: Batch write events to reduce DynamoDB writes
- **Audit Logs**: Archive old logs to S3 after 90 days

### API Rate Limiting

Consider adding CloudFront cache headers for expensive queries:

```javascript
// For GET /videos/{id}/analytics
// Cache for 5 minutes to avoid repeated scans
```

### Frontend Optimization

- **Lazy load** comment sections and analytics dashboards
- **Debounce** engagement tracking to reduce API calls
- **Use React.memo** for components that don't change frequently

```jsx
import { memo } from 'react';

export const VideoRatings = memo(function VideoRatings({ videoId }) {
  // Component implementation
});
```

## Security Considerations

### Audit Logging

All user actions are automatically logged. Monitor these logs for:
- Unauthorized admin access attempts
- Bulk deletion activity
- Rapid comment posting (spam detection)

### Violation Reporting

Reports are marked as "pending" and require manual review:

```javascript
// Future: Auto-flag reports with certain keywords
const flaggedWords = ['hate', 'violence', 'sexual'];
const shouldAutoFlag = flaggedWords.some(word => 
  description.toLowerCase().includes(word)
);
```

### Permissions

Ensure only admins can access:
- `/admin/audit-logs`
- Violation review endpoints
- Permission management

## Next Steps

1. **Deploy to staging** and test all features
2. **Get user feedback** on social features
3. **Monitor analytics** to identify trends
4. **Implement recommendations** based on data
5. **Add notifications** when users receive comments/likes
6. **Create moderation queue** for violation reports
7. **Build compliance reports** for GDPR/COPPA

## Support

For issues or questions:
1. Check the `docs/SOCIAL_ADMIN_ANALYTICS.md` for detailed API documentation
2. Review Lambda function logs in CloudWatch
3. Check browser console for frontend errors
4. Enable verbose logging: `LOG_LEVEL=DEBUG`
