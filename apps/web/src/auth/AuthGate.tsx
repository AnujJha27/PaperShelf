import type { ReactNode } from "react";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { allowedEmail, useSession } from "./useSession";

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const configuredEmail = import.meta.env.VITE_ALLOWED_EMAIL as string | undefined;

  if (loading) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}><Typography color="text.secondary">Loading your research workspace…</Typography></Box>;
  const client = supabase;
  if (!client) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}><Alert severity="error">Supabase is not configured.</Alert></Box>;
  if (!session) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3, bgcolor: "background.default" }}><Paper sx={{ p: { xs: 3, sm: 5 }, maxWidth: 440, width: "100%" }}><Stack spacing={2.5}><Box><Typography variant="h1">Personal Research Radar</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>A quieter way to find, read, and keep the papers worth your time.</Typography></Box><Button variant="contained" size="large" onClick={() => void client.auth.signInWithOAuth({ provider: "google" })}>Continue with Google</Button></Stack></Paper></Box>
    );
  }
  if (!allowedEmail(session.user.email, configuredEmail)) {
    return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}><Alert severity="error">This Google account is not allowed.</Alert></Box>;
  }

  return <>{children}</>;
}

export function SignedOutRedirect() {
  return <Navigate to="/" replace />;
}
