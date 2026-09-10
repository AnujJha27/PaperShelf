import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { allowedEmail, useSession } from "./useSession";

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const configuredEmail = import.meta.env.VITE_ALLOWED_EMAIL as string | undefined;

  if (loading) return <p>Loading your research workspace…</p>;
  const client = supabase;
  if (!client) return <p>Supabase is not configured.</p>;
  if (!session) {
    return (
      <main>
        <h1>Personal Research Radar</h1>
        <button onClick={() => void client.auth.signInWithOAuth({ provider: "google" })}>
          Continue with Google
        </button>
      </main>
    );
  }
  if (!allowedEmail(session.user.email, configuredEmail)) {
    return <p>This Google account is not allowed.</p>;
  }

  return <>{children}</>;
}

export function SignedOutRedirect() {
  return <Navigate to="/" replace />;
}
