import { Hub } from "aws-amplify/utils";
import { useEffect, useState } from "react";

export default function AuthCallback() {
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn") {
        // Redirect to root — App.jsx will detect the user and show dashboard
        window.location.assign("/");
      }
      if (payload.event === "signInWithRedirect_failure") {
        setMessage("Sign-in failed. Redirecting...");
        setTimeout(() => window.location.assign("/"), 1200);
      }
    });
    return unsubscribe;
  }, []);

  return (
    <main className="auth-page">
      <div className="auth-backdrop">
        <div className="auth-glow auth-glow-1"></div>
        <div className="auth-glow auth-glow-2"></div>
      </div>
      <div className="auth-card glass-panel fade-in">
        <div className="auth-loading-inline">
          <div className="spinner"></div>
          <p>{message}</p>
        </div>
      </div>
    </main>
  );
}
