import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Box, Button, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, Typography } from "@mui/material";
import type { Feed, PaperAction, Recommendation } from "@paper-radar/shared";
import { addToZotero, getSettings, getTrainingReadiness, listFeeds, listRecommendations, requestTrainingBatch, updatePaperState, updateSettings } from "../../lib/api";
import { PaperCard } from "../papers/PaperCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageContainer } from "../../components/layout/PageContainer";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { trainingRefreshInterval } from "./trainingPolling";

export function dedupeRecommendations(recommendations: Recommendation[]): Recommendation[] {
  const unique = new Map<string, Recommendation>();
  for (const item of recommendations) {
    if (item.state && item.state.status !== "inbox") continue;
    const existing = unique.get(item.paper_id);
    const labels = new Set(existing?.feedLabels ?? (existing?.feed?.name ? [existing.feed.name] : []));
    if (item.feed?.name) labels.add(item.feed.name);
    if (!existing || item.final_score > existing.final_score) unique.set(item.paper_id, { ...item, feedLabels: [...labels] });
    else unique.set(item.paper_id, { ...existing, feedLabels: [...labels] });
  }
  return [...unique.values()];
}

export function TodayPage({ training = false }: { training?: boolean }) {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [searchParams] = useSearchParams();
  const [feedId, setFeedId] = useState<string | undefined>(() => searchParams.get("feed") ?? undefined);
  const [message, setMessage] = useState("");
  const [batchPending, setBatchPending] = useState(false);
  const batchStartedAt = useRef<number | undefined>(undefined);
  const baselinePaperIds = useRef<Set<string>>(new Set());
  const [sort, setSort] = useState<"newest" | "recommended">("recommended");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<{ total: number; relevant: number; maybe: number; positive: number; negative: number; feedCoverage: number; balancedAccuracy: number; ready: boolean }>();

  const recommendationsQuery = useQuery({ queryKey: ["recommendations", feedId ?? "all"], queryFn: () => listRecommendations(feedId), refetchInterval: trainingRefreshInterval(batchPending) });
  const feedsQuery = useQuery({ queryKey: ["feeds"], queryFn: listFeeds });
  const readinessQuery = useQuery({ queryKey: ["training-readiness"], queryFn: getTrainingReadiness, enabled: training });
  const settingsQuery = useQuery({ queryKey: ["app-settings"], queryFn: getSettings, enabled: training });
  useEffect(() => { if (recommendationsQuery.data) setItems(dedupeRecommendations(recommendationsQuery.data)); }, [recommendationsQuery.data]);
  useEffect(() => { if (feedsQuery.data) setFeeds(feedsQuery.data); }, [feedsQuery.data]);
  useEffect(() => { if (readinessQuery.data) setReadiness(readinessQuery.data); }, [readinessQuery.data]);
  useEffect(() => {
    if (!batchPending || !recommendationsQuery.data) return;
    const hasNewPapers = recommendationsQuery.data.some((item) => !baselinePaperIds.current.has(item.paper_id));
    const timedOut = batchStartedAt.current !== undefined && Date.now() - batchStartedAt.current > 120_000;
    if (hasNewPapers || timedOut) {
      setBatchPending(false);
      batchStartedAt.current = undefined;
      if (hasNewPapers) setMessage("New training papers are ready");
    }
  }, [batchPending, recommendationsQuery.data]);
  useEffect(() => { const error = recommendationsQuery.error ?? feedsQuery.error ?? readinessQuery.error ?? settingsQuery.error; if (error) setMessage((error as Error).message); }, [recommendationsQuery.error, feedsQuery.error, readinessQuery.error, settingsQuery.error]);

  async function fetchTrainingBatch() {
    baselinePaperIds.current = new Set((recommendationsQuery.data ?? []).map((item) => item.paper_id));
    batchStartedAt.current = Date.now();
    try {
      await requestTrainingBatch(feedId ?? null, trainingBatchSize);
      setBatchPending(true);
      setMessage("Batch queued. Checking for new papers…");
    } catch (error) {
      batchStartedAt.current = undefined;
      setMessage((error as Error).message);
    }
  }

  async function act(item: Recommendation, action: PaperAction) {
    setItems((current) => current.filter((candidate) => candidate.paper_id !== item.paper_id));
    try { await updatePaperState(item.paper_id, action, item.feed_id); } catch (error) { setMessage((error as Error).message); void recommendationsQuery.refetch(); }
  }

  async function enableStableMode() {
    const settings = settingsQuery.data;
    if (!readiness?.ready || !settings) return;
    try {
      await updateSettings({ training_batch_size: settings.training_batch_size, exploration_rate: settings.exploration_rate, recommender_mode: "stable", schedule_enabled: true });
      setMessage("Twice-daily discovery enabled");
      void settingsQuery.refetch();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  const visible = [...items].sort((left, right) => sort === "recommended" ? right.final_score - left.final_score : (right.created_at ?? "").localeCompare(left.created_at ?? ""));
  useEffect(() => setSelectedIndex((index) => Math.min(index, Math.max(0, visible.length - 1))), [visible.length]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (!visible.length) return;
      if (["j", "ArrowDown", "k", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        setSelectedIndex((index) => event.key === "j" || event.key === "ArrowDown" ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1));
        return;
      }
      const item = visible[selectedIndex];
      if (!item) return;
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        event.preventDefault();
        void act(item, { type: event.key === "1" ? "not_relevant" : event.key === "2" ? "maybe" : "relevant" });
      } else if (event.key === "Enter") {
        event.preventDefault();
        navigate(`/reading/${item.paper_id}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, selectedIndex, visible]);
  const trainingStatus = settingsQuery.data?.recommender_mode === "stable" ? "Stable" : !readiness ? "Loading" : readiness.total === 0 ? "Cold start" : readiness.ready ? "Ready" : readiness.balancedAccuracy > 0 ? "Training" : "Calibrating";
  const trainingBatchSize = settingsQuery.data?.training_batch_size ?? 25;
  return <PageContainer>
    <PageHeader title={training ? "Training" : "Today"} description={training ? "Read full abstracts and label a small batch to teach your radar what matters." : "A calm shortlist of papers worth your attention today."} action={training && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}><StatusBadge label={batchPending ? "Checking" : trainingStatus} tone={batchPending ? "info" : trainingStatus === "Ready" || trainingStatus === "Stable" ? "success" : trainingStatus === "Training" ? "info" : "default"} /><Button variant="contained" disabled={batchPending} onClick={() => void fetchTrainingBatch()}>{batchPending ? "Checking…" : `Fetch ${trainingBatchSize} more`}</Button></Stack>} />
    {training && <Stack spacing={1.25} sx={{ mb: 3 }}><Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Typography variant="body2" color="text.secondary">{readiness?.total ?? 0} labels · Relevant {readiness?.relevant ?? 0} · Maybe {readiness?.maybe ?? 0} · Not relevant {readiness?.negative ?? 0}</Typography><Typography variant="body2" color="text.secondary">{readiness?.balancedAccuracy.toFixed(2) ?? "0.00"} balanced accuracy</Typography></Stack><LinearProgress variant="determinate" value={Math.min(100, ((readiness?.total ?? 0) / 60) * 100)} aria-label="Training progress" />{readiness?.ready && settingsQuery.data?.recommender_mode !== "stable" && <Button size="small" variant="outlined" onClick={() => void enableStableMode()} sx={{ alignSelf: "flex-start" }}>Enable twice-daily discovery</Button>}</Stack>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
      <FormControl size="small" sx={{ minWidth: 190 }}><InputLabel id="feed-filter-label">Feed</InputLabel><Select labelId="feed-filter-label" value={feedId ?? ""} label="Feed" onChange={(event) => setFeedId(event.target.value || undefined)}><MenuItem value="">All feeds</MenuItem>{feeds.map((feed) => <MenuItem key={feed.id} value={feed.id}>{feed.name}</MenuItem>)}</Select></FormControl>
      {!training && <FormControl size="small" sx={{ minWidth: 160 }}><InputLabel id="sort-label">Sort</InputLabel><Select labelId="sort-label" value={sort} label="Sort" onChange={(event) => setSort(event.target.value as typeof sort)}><MenuItem value="recommended">Recommended</MenuItem><MenuItem value="newest">Newest</MenuItem></Select></FormControl>}
    </Stack>
    {message && <Alert severity={message.includes("queued") || message.includes("ready") ? "success" : "error"} onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}
    {!recommendationsQuery.isLoading && visible.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>Keyboard: J/K or ↑/↓ move · 1 no · 2 maybe · 3 relevant · Enter opens</Typography>}
    {recommendationsQuery.isLoading ? <Typography color="text.secondary">Loading your papers…</Typography> : visible.map((item, index) => <Box key={item.id} sx={{ outline: index === selectedIndex ? "2px solid" : "none", outlineColor: "primary.main", borderRadius: 2 }}>{<PaperCard paper={item.paper} reason={item.reason_text} score={item.final_score} components={item.components} feedLabels={item.feedLabels} abstractMode={training ? "full" : "preview"} onAction={(action) => void act(item, action)} onAddToZotero={() => void addToZotero(item.paper_id, item.feed_id).then(() => setMessage("Added to Zotero")).catch((error: Error) => setMessage(error.message))} />}</Box>)}
    {!recommendationsQuery.isLoading && !items.length && <EmptyState title={training ? "No training papers yet" : "Your radar is quiet"} description={training ? "Fetch a batch when you’re ready to label more examples." : "Fetch a training batch or check back after your next discovery run."} />}
  </PageContainer>;
}
