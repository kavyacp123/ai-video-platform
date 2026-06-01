import React, { useState } from "react";
import { CommentSection } from "./CommentSection.jsx";
import { VideoRatings } from "./VideoRatings.jsx";
import { LikeButton } from "./LikeButton.jsx";
import { FollowButton } from "./FollowButton.jsx";
import { EngagementTracker } from "./EngagementTracker.jsx";
import { VideoAnalyticsDashboard } from "./VideoAnalyticsDashboard.jsx";
import { ViolationReportDialog } from "./ViolationReportDialog.jsx";

export function VideoWatch({ videoId, videoTitle, creatorUserId, videoDuration }) {
  const [showReportDialog, setShowReportDialog] = useState(false);
  const engagement = EngagementTracker({ videoId, videoDuration });

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }}>
        {/* Main Content */}
        <div>
          <div style={{ backgroundColor: "#000", borderRadius: "8px", marginBottom: "1.5rem", aspectRatio: "16/9" }}>
            {/* Video player would go here */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999" }}>
              Video Player (HLS.js)
            </div>
          </div>

          <h1 style={{ marginBottom: "1rem" }}>{videoTitle}</h1>

          <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            <LikeButton videoId={videoId} />
            <VideoRatings videoId={videoId} />
            <button
              onClick={() => setShowReportDialog(true)}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Report Content
            </button>
          </div>

          <div style={{ marginBottom: "2rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "#ddd"
                }}
              />
              <div>
                <div style={{ fontWeight: "bold" }}>Creator Name</div>
                <div style={{ fontSize: "0.875rem", color: "#666" }}>Created on {new Date().toLocaleDateString()}</div>
              </div>
              <FollowButton userId={creatorUserId} />
            </div>
          </div>

          <CommentSection videoId={videoId} />
        </div>

        {/* Sidebar */}
        <div>
          <VideoAnalyticsDashboard videoId={videoId} />
        </div>
      </div>

      {showReportDialog && (
        <ViolationReportDialog videoId={videoId} onClose={() => setShowReportDialog(false)} />
      )}
    </div>
  );
}
