import React, { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function EngagementTracker({ videoId, videoDuration }) {
  const [tracking, setTracking] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  async function getAuthHeaders() {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
  }

  useEffect(() => {
    async function startSession() {
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_URL}/videos/${videoId}/watch-session`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            startTime: new Date().toISOString(),
            position: 0,
            duration: videoDuration || 0
          })
        });

        if (!response.ok) throw new Error("Failed to start session");

        const data = await response.json();
        setSessionId(data.sessionId);
        setTracking(true);
      } catch (error) {
        console.error("Error starting watch session:", error);
      }
    }

    startSession();
  }, [videoId, videoDuration]);

  async function trackEngagement(eventType, position) {
    if (!tracking || !sessionId) return;

    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_URL}/videos/${videoId}/engagement`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          position,
          metadata: { sessionId }
        })
      });
    } catch (error) {
      console.error("Error tracking engagement:", error);
    }
  }

  return {
    trackEngagement,
    trackPlay: (position) => trackEngagement("play", position),
    trackPause: (position) => trackEngagement("pause", position),
    trackSkip: (position) => trackEngagement("skip", position),
    trackReplay: (position) => trackEngagement("replay", position)
  };
}
