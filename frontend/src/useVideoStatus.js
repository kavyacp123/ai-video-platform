import { useEffect, useState } from "react";

export function useVideoStatus(videoId) {
  const [state, setState] = useState({ status: "idle", playbackUrl: null, progress: 0 });

  useEffect(() => {
    if (!videoId || !import.meta.env.VITE_WEBSOCKET_URL) return undefined;

    let closed = false;
    let socket;

    const connect = () => {
      socket = new WebSocket(`${import.meta.env.VITE_WEBSOCKET_URL}?videoId=${videoId}`);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        setState((current) => ({ ...current, ...message }));
      };
      socket.onclose = () => {
        if (!closed) setTimeout(connect, 1000);
      };
    };

    connect();
    return () => {
      closed = true;
      socket?.close();
    };
  }, [videoId]);

  return state;
}

