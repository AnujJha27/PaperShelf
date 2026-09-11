import { useEffect, useState } from "react";
import { Alert, Button, Divider, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from "@mui/material";
import type { AppSettings } from "@paper-radar/shared";
import { getDiagnostics, getSettings, getTrainingReadiness, requestZoteroSync, updateSettings } from "../../lib/api";
import { useSession } from "../../auth/useSession";
import { supabase } from "../../lib/supabase";
import { PageContainer } from "../../components/layout/PageContainer";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useThemeMode } from "../../theme";

export function SettingsPage() {
  const { session } = useSession();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [readiness, setReadiness] = useState<{ total: number; relevant: number; maybe: number; positive: number; negative: number; feedCoverage: number; balancedAccuracy: number; ready: boolean }>();
  const [message, setMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<{ runs: Array<{ mode: string; status: string; finished_at: string | null }>; lastZoteroSync: { status: string } | null; model: { trained_at?: string } | null; apiErrors: Array<{ mode: string; error?: string }>; guardrails: { max_feed_recommendations?: number; max_today_recommendations?: number; exploration_rate?: number } | null }>();

  useEffect(() => {
    void Promise.all([getSettings(), getTrainingReadiness(), getDiagnostics()]).then(([nextSettings, nextReadiness, nextDiagnostics]) => { setSettings(nextSettings); setReadiness(nextReadiness); setDiagnostics(nextDiagnostics as typeof diagnostics); }).catch((error: Error) => setMessage(error.message));
  }, []);

  async function save(enableSchedule = false) {
    if (!settings || (enableSchedule && !readiness?.ready)) return;
    try {
      setSettings(await updateSettings({ training_batch_size: settings.training_batch_size, exploration_rate: settings.exploration_rate, recommender_mode: enableSchedule ? "stable" : settings.recommender_mode, schedule_enabled: enableSchedule ? true : settings.schedule_enabled }));
      setMessage("Saved");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function syncZotero() {
    try {
      await requestZoteroSync();
      setMessage("Zotero sync queued");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function disableSchedule() {
    if (!settings) return;
    try {
      setSettings(await updateSettings({ training_batch_size: settings.training_batch_size, exploration_rate: settings.exploration_rate, recommender_mode: "training", schedule_enabled: false }));
      setMessage("Scheduled discovery disabled");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  const { mode, setMode } = useThemeMode();
  return <PageContainer><PageHeader title="Settings" description="Control discovery, integrations, and the way PaperShelf feels." action={<Button variant="outlined" onClick={() => void supabase?.auth.signOut()}>Sign out</Button>} />{message && <Alert severity={message === "Saved" || message.includes("queued") ? "success" : "error"} onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}<Stack spacing={2}><Paper sx={{ p: { xs: 2, sm: 3 } }}><Stack spacing={2}><Typography variant="h2">Workspace</Typography><Typography color="text.secondary">Signed in as {session?.user.email ?? "—"}</Typography><Stack direction={{ xs: "column", sm: "row" }} spacing={2}><FormControl sx={{ minWidth: 180 }}><InputLabel id="theme-mode-label">Theme</InputLabel><Select labelId="theme-mode-label" label="Theme" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><MenuItem value="dark">Dark</MenuItem><MenuItem value="light">Light</MenuItem><MenuItem value="system">System</MenuItem></Select></FormControl><Stack spacing={0.5}><Typography variant="body2">Zotero connection</Typography><StatusBadge label={import.meta.env.VITE_GATEWAY_URL ? "Gateway configured" : "Not configured"} tone={import.meta.env.VITE_GATEWAY_URL ? "success" : "warning"} /></Stack></Stack></Stack></Paper><Paper sx={{ p: { xs: 2, sm: 3 } }}><Stack spacing={2}><Typography variant="h2">Discovery</Typography><Stack direction={{ xs: "column", sm: "row" }} spacing={2}>{settings && <><TextField label="Training batch size" type="number" slotProps={{ htmlInput: { min: 1, max: 100 } }} value={settings.training_batch_size} onChange={(event) => setSettings({ ...settings, training_batch_size: Number(event.target.value) })} /><TextField label="Exploration rate" type="number" slotProps={{ htmlInput: { min: 0, max: 1, step: 0.01 } }} value={settings.exploration_rate} onChange={(event) => setSettings({ ...settings, exploration_rate: Number(event.target.value) })} /></>}</Stack><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}><Button variant="contained" onClick={() => void save()} disabled={!settings}>Save settings</Button><Button variant="outlined" disabled={!readiness?.ready || settings?.recommender_mode === "stable"} onClick={() => void save(true)}>Enable twice-daily discovery</Button><Button color="warning" disabled={!settings || (!settings.schedule_enabled && settings.recommender_mode === "training")} onClick={() => void disableSchedule()}>Disable schedule</Button></Stack></Stack></Paper><Paper sx={{ p: { xs: 2, sm: 3 } }}><Stack spacing={1.5}><Typography variant="h2">Diagnostics</Typography><Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1, flexWrap: "wrap" }}><StatusBadge label={`Mode: ${settings?.recommender_mode ?? "Loading"}`} tone={settings?.recommender_mode === "stable" ? "success" : "default"} /><StatusBadge label={`Schedule: ${settings?.schedule_enabled ? "Enabled" : "Disabled"}`} /><StatusBadge label={`${readiness?.total ?? 0} training labels`} /></Stack><Divider /><Typography variant="body2" color="text.secondary">Last run: {diagnostics?.runs[0] ? `${diagnostics.runs[0].mode} · ${diagnostics.runs[0].status}` : "No runs yet"}</Typography><Typography variant="body2" color="text.secondary">Free-mode caps: {diagnostics?.guardrails?.max_feed_recommendations ?? "—"} per feed · {diagnostics?.guardrails?.max_today_recommendations ?? "—"} today · exploration {diagnostics?.guardrails?.exploration_rate ?? "—"}</Typography><Typography variant="body2" color="text.secondary">Last Zotero sync: {diagnostics?.lastZoteroSync?.status ?? "No sync yet"} · model: {diagnostics?.model?.trained_at ?? "Not trained"} · API failures: {diagnostics?.apiErrors.length ?? 0}</Typography><Button onClick={() => void syncZotero()} sx={{ alignSelf: "flex-start" }}>Sync Zotero now</Button></Stack></Paper></Stack></PageContainer>;
}
