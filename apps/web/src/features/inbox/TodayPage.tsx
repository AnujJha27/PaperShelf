import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Feed, PaperAction, Recommendation } from "@paper-radar/shared";
import { addToZotero, getSettings, getTrainingReadiness, listFeeds, listRecommendations, requestTrainingBatch, updatePaperState, updateSettings } from "../../lib/api";
import { PaperCard } from "../papers/PaperCard";

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
  return <main>
    <h1>{training ? "Training" : "Today"}</h1>
    {training && <p>Full abstracts are shown so each label is deliberate. Status: {trainingStatus}. Labels: {readiness?.total ?? 0} total · Relevant {readiness?.relevant ?? 0} · Maybe {readiness?.maybe ?? 0} · Not relevant {readiness?.negative ?? 0} · feeds {readiness?.feedCoverage ?? 0} · accuracy {readiness?.balancedAccuracy.toFixed(2) ?? "0.00"}</p>}
    <label>Feed <select value={feedId ?? ""} onChange={(event) => setFeedId(event.target.value || undefined)}><option value="">All feeds</option>{feeds.map((feed) => <option key={feed.id} value={feed.id}>{feed.name}</option>)}</select></label>
    {!training && <label> Sort <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recommended">Recommended</option><option value="newest">Newest</option></select></label>}
    {training && <button onClick={() => requestTrainingBatch(feedId ?? null, trainingBatchSize).then(() => setMessage("Training batch queued")).catch((error: Error) => setMessage(error.message))}>Fetch {trainingBatchSize} more</button>}
    {training && readiness?.ready && settingsQuery.data?.recommender_mode !== "stable" && <button onClick={() => void enableStableMode()}>Enable twice-daily discovery</button>}
    <p role="status">{message}</p>
    {visible.map((item) => <PaperCard key={item.id} paper={item.paper} reason={item.reason_text} score={item.final_score} components={item.components} feedLabels={item.feedLabels} onAction={(action) => void act(item, action)} onAddToZotero={() => void addToZotero(item.paper_id, item.feed_id).then(() => setMessage("Added to Zotero")).catch((error: Error) => setMessage(error.message))} />)}
    {!items.length && <p>No papers here yet.</p>}
  </main>;
}
