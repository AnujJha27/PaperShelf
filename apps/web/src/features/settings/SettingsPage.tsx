import { useEffect, useState } from "react";
import type { AppSettings } from "@paper-radar/shared";
import { getDiagnostics, getSettings, getTrainingReadiness, requestZoteroSync, updateSettings } from "../../lib/api";
import { useSession } from "../../auth/useSession";
import { supabase } from "../../lib/supabase";

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

  return <main>
    <h1>Settings</h1>
    <p>Signed in as {session?.user.email ?? "—"}</p>
    <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>
    <p>Recommender status: {settings?.recommender_mode ?? "Loading"}</p>
    <p>Scheduled discovery: {settings?.schedule_enabled ? "Enabled" : "Disabled"}</p>
    <p>Zotero connection: {import.meta.env.VITE_GATEWAY_URL ? "Gateway configured" : "Not configured"} · {diagnostics?.lastZoteroSync?.status ?? "No sync yet"}</p>
    <p>Training labels: {readiness?.total ?? 0} total · Relevant {readiness?.relevant ?? 0} · Maybe {readiness?.maybe ?? 0} · Not relevant {readiness?.negative ?? 0} · balanced accuracy {readiness?.balancedAccuracy.toFixed(2) ?? "0.00"}</p>
    <h2>Diagnostics</h2>
    <p>Last run: {diagnostics?.runs[0] ? `${diagnostics.runs[0].mode} · ${diagnostics.runs[0].status}` : "No runs yet"}</p>
    <p>Free-mode caps: {diagnostics?.guardrails?.max_feed_recommendations ?? "—"} per feed · {diagnostics?.guardrails?.max_today_recommendations ?? "—"} today · exploration {diagnostics?.guardrails?.exploration_rate ?? "—"}</p>
    <p>Last Zotero sync: {diagnostics?.lastZoteroSync?.status ?? "No sync yet"} · model: {diagnostics?.model?.trained_at ?? "Not trained"} · API failures: {diagnostics?.apiErrors.length ?? 0}</p>
    <button onClick={() => void syncZotero()}>Sync Zotero now</button>
    {settings && <>
      <label>Training batch size <input type="number" min="1" max="100" value={settings.training_batch_size} onChange={(event) => setSettings({ ...settings, training_batch_size: Number(event.target.value) })} /></label>
      <label>Exploration rate <input type="number" min="0" max="1" step="0.01" value={settings.exploration_rate} onChange={(event) => setSettings({ ...settings, exploration_rate: Number(event.target.value) })} /></label>
      <button onClick={() => void save()}>Save settings</button>
      <button disabled={!readiness?.ready || settings.recommender_mode === "stable"} onClick={() => void save(true)}>Enable twice-daily discovery</button>
      <button disabled={!settings.schedule_enabled && settings.recommender_mode === "training"} onClick={() => void disableSchedule()}>Disable scheduled discovery</button>
    </>}
    <p role="status">{message}</p>
  </main>;
}
