import type { ReactNode } from "react";
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { Navigate } from "react-router-dom";
import { appName } from "../app/App";
import { supabase } from "../lib/supabase";
import { allowedEmail, useSession } from "./useSession";

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const configuredEmail = import.meta.env.VITE_ALLOWED_EMAIL as string | undefined;

  if (loading) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}><Typography color="text.secondary">Loading your research workspace…</Typography></Box>;
  const client = supabase;
  if (!client) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}><Alert severity="error">Supabase is not configured.</Alert></Box>;
  if (!session) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: { xs: 2, sm: 4 }, bgcolor: "background.default" }}><Box sx={{ width: "100%", maxWidth: 980, display: "grid", gridTemplateColumns: { md: "1fr 420px" }, gap: { xs: 3, md: 8 }, alignItems: "center" }}><Box sx={{ px: { md: 2 } }}><Chip label="Your research workspace" color="primary" variant="outlined" sx={{ mb: 2 }} /><Typography variant="h1" sx={{ maxWidth: 600 }}>{appName}</Typography><Typography color="text.secondary" sx={{ mt: 2, maxWidth: 540, fontSize: { sm: "1.05rem" } }}>A quieter way to find, read, and keep the papers worth your time.</Typography><Stack direction="row" spacing={1} sx={{ mt: 3, color: "text.secondary" }}><Typography variant="body2">Discover</Typography><Typography variant="body2" color="text.disabled">·</Typography><Typography variant="body2">Read</Typography><Typography variant="body2" color="text.disabled">·</Typography><Typography variant="body2">Remember</Typography></Stack></Box><Paper sx={{ p: { xs: 3, sm: 4 }, width: "100%" }}><Stack spacing={2.5}><Box><Typography variant="h2">Welcome back</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Sign in to continue to your papers and notes.</Typography></Box><Button variant="contained" size="large" onClick={() => void client.auth.signInWithOAuth({ provider: "google" })}>Continue with Google</Button></Stack></Paper></Box></Box>;
  if (!allowedEmail(session.user.email, configuredEmail)) {
    return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3, bgcolor: "background.default" }}><Paper sx={{ p: 4, maxWidth: 440, width: "100%" }}><Stack spacing={2}><Typography variant="h2">Account not allowed</Typography><Alert severity="error">This Google account is not allowed.</Alert><Button variant="outlined" onClick={() => void client.auth.signOut()}>Use another account</Button></Stack></Paper></Box>;
  }

  return <>{children}</>;
}

export function SignedOutRedirect() {
  return <Navigate to="/" replace />;
}
