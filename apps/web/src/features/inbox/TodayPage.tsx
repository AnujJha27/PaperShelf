import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, Typography } from "@mui/material";
import type { Feed, PaperAction, Recommendation } from "@paper-radar/shared";
import { addToZotero, getSettings, getTrainingReadiness, listFeeds, listRecommendations, requestTrainingBatch, updatePaperState, updateSettings } from "../../lib/api";
import { PaperCard } from "../papers/PaperCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageContainer } from "../../components/layout/PageContainer";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";

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
  const [sort, setSort] = useState<"newest" | "recommended">("recommended");
  const [readiness, setReadiness] = useState<{ total: number; relevant: number; maybe: number; positive: number; negative: number; feedCoverage: number; balancedAccuracy: number; ready: boolean }>();

  const recommendationsQuery = useQuery({ queryKey: ["recommendations", feedId ?? "all"], queryFn: () => listRecommendations(feedId) });
  const feedsQuery = useQuery({ queryKey: ["feeds"], queryFn: listFeeds });
  const readinessQuery = useQuery({ queryKey: ["training-readiness"], queryFn: getTrainingReadiness, enabled: training });
  const settingsQuery = useQuery({ queryKey: ["app-settings"], queryFn: getSettings, enabled: training });
  useEffect(() => { if (recommendationsQuery.data) setItems(dedupeRecommendations(recommendationsQuery.data)); }, [recommendationsQuery.data]);
  useEffect(() => { if (feedsQuery.data) setFeeds(feedsQuery.data); }, [feedsQuery.data]);
  useEffect(() => { if (readinessQuery.data) setReadiness(readinessQuery.data); }, [readinessQuery.data]);
  useEffect(() => { const error = recommendationsQuery.error ?? feedsQuery.error ?? readinessQuery.error ?? settingsQuery.error; if (error) setMessage((error as Error).message); }, [recommendationsQuery.error, feedsQuery.error, readinessQuery.error, settingsQuery.error]);

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
  const trainingStatus = settingsQuery.data?.recommender_mode === "stable" ? "Stable" : !readiness ? "Loading" : readiness.total === 0 ? "Cold start" : readiness.ready ? "Ready" : readiness.balancedAccuracy > 0 ? "Training" : "Calibrating";
  const trainingBatchSize = settingsQuery.data?.training_batch_size ?? 25;
  return <PageContainer>
    <PageHeader title={training ? "Training" : "Today"} description={training ? "Read full abstracts and label a small batch to teach your radar what matters." : "A calm shortlist of papers worth your attention today."} action={training && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}><StatusBadge label={trainingStatus} tone={trainingStatus === "Ready" || trainingStatus === "Stable" ? "success" : trainingStatus === "Training" ? "info" : "default"} /><Button variant="contained" onClick={() => requestTrainingBatch(feedId ?? null, trainingBatchSize).then(() => setMessage("Training batch queued")).catch((error: Error) => setMessage(error.message))}>Fetch {trainingBatchSize} more</Button></Stack>} />
    {training && <Stack spacing={1.25} sx={{ mb: 3 }}><Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Typography variant="body2" color="text.secondary">{readiness?.total ?? 0} labels · Relevant {readiness?.relevant ?? 0} · Maybe {readiness?.maybe ?? 0} · Not relevant {readiness?.negative ?? 0}</Typography><Typography variant="body2" color="text.secondary">{readiness?.balancedAccuracy.toFixed(2) ?? "0.00"} balanced accuracy</Typography></Stack><LinearProgress variant="determinate" value={Math.min(100, ((readiness?.total ?? 0) / 60) * 100)} aria-label="Training progress" />{readiness?.ready && settingsQuery.data?.recommender_mode !== "stable" && <Button size="small" variant="outlined" onClick={() => void enableStableMode()} sx={{ alignSelf: "flex-start" }}>Enable twice-daily discovery</Button>}</Stack>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
      <FormControl size="small" sx={{ minWidth: 190 }}><InputLabel id="feed-filter-label">Feed</InputLabel><Select labelId="feed-filter-label" value={feedId ?? ""} label="Feed" onChange={(event) => setFeedId(event.target.value || undefined)}><MenuItem value="">All feeds</MenuItem>{feeds.map((feed) => <MenuItem key={feed.id} value={feed.id}>{feed.name}</MenuItem>)}</Select></FormControl>
      {!training && <FormControl size="small" sx={{ minWidth: 160 }}><InputLabel id="sort-label">Sort</InputLabel><Select labelId="sort-label" value={sort} label="Sort" onChange={(event) => setSort(event.target.value as typeof sort)}><MenuItem value="recommended">Recommended</MenuItem><MenuItem value="newest">Newest</MenuItem></Select></FormControl>}
    </Stack>
    {message && <Alert severity="error" onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}
    {recommendationsQuery.isLoading ? <Typography color="text.secondary">Loading your papers…</Typography> : visible.map((item) => <PaperCard key={item.id} paper={item.paper} reason={item.reason_text} score={item.final_score} components={item.components} feedLabels={item.feedLabels} abstractMode={training ? "full" : "preview"} onAction={(action) => void act(item, action)} onAddToZotero={() => void addToZotero(item.paper_id, item.feed_id).then(() => setMessage("Added to Zotero")).catch((error: Error) => setMessage(error.message))} />)}
    {!recommendationsQuery.isLoading && !items.length && <EmptyState title={training ? "No training papers yet" : "Your radar is quiet"} description={training ? "Fetch a batch when you’re ready to label more examples." : "Fetch a training batch or check back after your next discovery run."} />}
  </PageContainer>;
}
