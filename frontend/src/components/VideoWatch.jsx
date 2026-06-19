import React, { useState } from "react";
import { CommentSection } from "./CommentSection.jsx";
import { VideoRatings } from "./VideoRatings.jsx";
import { LikeButton } from "./LikeButton.jsx";
import { FollowButton } from "./FollowButton.jsx";
import { EngagementTracker } from "./EngagementTracker.jsx";
import { VideoAnalyticsDashboard } from "./VideoAnalyticsDashboard.jsx";
import { ViolationReportDialog } from "./ViolationReportDialog.jsx";
import { AlertTriangle, User } from "lucide-react";

export function VideoWatch({ videoId, videoTitle, creatorUserId, videoDuration }) {
  const [showReportDialog, setShowReportDialog] = useState(false);
  const engagement = EngagementTracker({ videoId, videoDuration });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: "2rem" }}>
      {/* Main Content */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <h1 style={{ fontSize: "1.8rem", color: "var(--text-primary)", background: "none", WebkitTextFillColor: "var(--text-primary)", marginBottom: 0 }}>
          {videoTitle || "Untitled Video"}
        </h1>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <LikeButton videoId={videoId} />
          <VideoRatings videoId={videoId} />
          <button
            className="btn btn-danger"
            onClick={() => setShowReportDialog(true)}
            style={{ marginLeft: "auto" }}
          >
            <AlertTriangle size={16} />
            Report
          </button>
        </div>

        <div className="glass-panel" style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "1.5rem", background: "var(--bg-tertiary)" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--accent-gradient)", display: "grid", placeItems: "center" }}>
            <User size={28} color="white" />
          </div>
          <div style={{ flexGrow: 1 }}>
            <div style={{ fontWeight: "700", fontSize: "1.1rem", color: "var(--text-primary)" }}>Creator Name</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
              Uploaded on {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <FollowButton userId={creatorUserId} />
        </div>

        <CommentSection videoId={videoId} />
      </div>

      {/* Sidebar */}
      <div>
        <VideoAnalyticsDashboard videoId={videoId} />
      </div>

      {showReportDialog && (
        <ViolationReportDialog videoId={videoId} onClose={() => setShowReportDialog(false)} />
      )}
    </div>
  );
}
