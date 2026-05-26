import { signInWithRedirect } from "aws-amplify/auth";

export default function AuthPage() {
  return (
    <main className="auth-page">
      <button className="google-button" onClick={() => signInWithRedirect({ provider: "Google" })}>
        <span>G</span>
        Continue with Google
      </button>
    </main>
  );
}

