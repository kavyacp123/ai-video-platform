import React, { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);

    async function getAuthHeaders() {
    try {
      const session = await fetchAuthSession();
      if (!session.tokens) return {};
      return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
    } catch (e) {
      return {};
    }
  }

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  async function loadNotifications() {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/notifications?limit=10`, { headers });

      if (!response.ok) throw new Error("Failed to load notifications");

      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  }

  async function markAsRead(notificationId) {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: "POST",
        headers
      });
      await loadNotifications();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setShowPanel(!showPanel)}
        style={{
          position: "relative",
          padding: "0.5rem 1rem",
          backgroundColor: "#0066cc",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem"
        }}
      >
        🔔 Notifications
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-8px",
              right: "-8px",
              backgroundColor: "#ff4444",
              color: "white",
              borderRadius: "50%",
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: "bold"
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "0.5rem",
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            minWidth: "300px",
            maxWidth: "400px",
            maxHeight: "400px",
            overflowY: "auto",
            zIndex: 1000
          }}
        >
          {notifications.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "#666" }}>
              No notifications yet
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.notificationId}
                onClick={() => markAsRead(notif.notificationId)}
                style={{
                  padding: "1rem",
                  borderBottom: "1px solid #eee",
                  cursor: "pointer",
                  backgroundColor: notif.read ? "white" : "#f0f7ff",
                  transition: "background-color 0.2s"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e8f1ff")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = notif.read ? "white" : "#f0f7ff")}
              >
                <div style={{ fontWeight: notif.read ? "normal" : "bold" }}>
                  {getNotificationIcon(notif.notificationType)} {getNotificationText(notif)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#999", marginTop: "0.25rem" }}>
                  {new Date(notif.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function getNotificationIcon(type) {
  const icons = {
    comment_reply: "💬",
    new_follower: "👤",
    video_like: "❤️",
    video_featured: "⭐"
  };
  return icons[type] || "📢";
}

function getNotificationText(notif) {
  switch (notif.notificationType) {
    case "comment_reply":
      return `Someone replied: "${notif.data?.text?.substring(0, 40)}..."`;
    case "new_follower":
      return "New follower!";
    case "video_like":
      return "Someone liked your video";
    case "video_featured":
      return `Your video "${notif.data?.title || "Untitled"}" was featured`;
    default:
      return "New notification";
  }
}
