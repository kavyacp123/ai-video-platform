import { Hub } from "aws-amplify/utils";
import { useEffect, useState } from "react";

export default function AuthCallback() {
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn") {
        window.location.assign("/dashboard");
      }
      if (payload.event === "signInWithRedirect_failure") {
        setMessage("Sign-in failed. Redirecting...");
        setTimeout(() => window.location.assign("/auth"), 1200);
      }
    });
    return unsubscribe;
  }, []);

  return <main className="auth-page">{message}</main>;
}

