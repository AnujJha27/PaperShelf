import type { AppSettings, Feed, FeedInput, Paper, Recommendation, PaperState, PaperAction, QueuePriority } from "@paper-radar/shared";
import { transitionPaperState } from "@paper-radar/shared";
import { supabase } from "./supabase";
import { normalizeKeywords, validateFeedInput } from "../features/feeds/validation";
import { summarizeFeedModel, type FeedModelStatus } from "../features/feeds/modelStatus";
import { summarizeTrainingLabels, trainingReady } from "../features/inbox/trainingReadiness";

function client() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

async function currentUser() {
  const { data, error } = await client().auth.getUser();
  if (error || !data.user) throw error ?? new Error("Not signed in");
  return data.user;
}

async function addZoteroStatus<T extends { id: string }>(items: T[]): Promise<Array<T & { in_zotero: boolean }>> {
  if (!items.length) return items.map((item) => ({ ...item, in_zotero: false }));
  const { data, error } = await client().from("zotero_items").select("paper_id").in("paper_id", items.map((item) => item.id));
  if (error) throw error;
  const saved = new Set((data ?? []).map((row: { paper_id: string | null }) => row.paper_id).filter(Boolean));
  return items.map((item) => ({ ...item, in_zotero: saved.has(item.id) }));
}

export async function listFeeds(): Promise<Feed[]> {
  const { data, error } = await client().from("feeds").select("*").order("name");
  if (error) throw error;
  return data as Feed[];
}

export async function getFeedModelStatuses(feedIds: string[]): Promise<Record<string, FeedModelStatus>> {
  if (!feedIds.length) return {};
  const [{ data: events, error: eventError }, { data: models, error: modelError }] = await Promise.all([
    client().from("feedback_events").select("feed_id,paper_id,label,event_type,created_at").in("feed_id", feedIds).order("created_at"),
    client().from("recommender_models").select("feed_id,metrics").eq("scope", "feed").in("feed_id", feedIds),
  ]);
  if (eventError) throw eventError;
  if (modelError) throw modelError;
  return Object.fromEntries(feedIds.map((feedId) => [
    feedId,
    summarizeFeedModel(
      feedId,
      (events ?? []).filter((event: { feed_id?: string | null }) => event.feed_id === feedId),
      (models ?? []).find((model: { feed_id?: string | null }) => model.feed_id === feedId) ?? null,
    ),
  ]));
}

export async function saveFeed(input: FeedInput, id?: string): Promise<Feed> {
  const errors = validateFeedInput(input);
  if (Object.keys(errors).length) throw new Error(Object.values(errors).join("; "));

  const values = {
    name: input.name.trim(),
    description: input.description.trim(),
    include_keywords: normalizeKeywords(input.include_keywords),
    exclude_keywords: normalizeKeywords(input.exclude_keywords),
    priority_keywords: normalizeKeywords(input.priority_keywords),
    min_semantic_similarity: input.min_semantic_similarity ?? 0.35,
    min_publication_year: input.min_publication_year ?? 2018,
  };
  const query = id
    ? client().from("feeds").update(values).eq("id", id)
    : client().from("feeds").insert({ ...values, user_id: (await currentUser()).id });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as Feed;
}

export async function setFeedActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await client().from("feeds").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

export async function getSettings(): Promise<AppSettings | null> {
  const { data, error } = await client().from("app_settings").select("*").maybeSingle();
  if (error) throw error;
  if (data) return data as AppSettings;
  const user = await currentUser();
  const { data: created, error: createError } = await client().from("app_settings").upsert({ user_id: user.id }).select().single();
  if (createError) throw createError;
  return created as AppSettings;
}

export async function updateSettings(values: Partial<Pick<AppSettings, "training_batch_size" | "exploration_rate" | "recommender_mode" | "schedule_enabled">>) {
  const user = await currentUser();
  const { data, error } = await client()
    .from("app_settings")
    .upsert({ user_id: user.id, ...values })
    .select()
    .single();
  if (error) throw error;
  return data as AppSettings;
}

export async function getTrainingReadiness() {
  const [{ data: feedback, error: feedbackError }, { data: model, error: modelError }] = await Promise.all([
    client().from("feedback_events").select("paper_id,label,event_type,feed_id,created_at").order("created_at"),
    client().from("recommender_models").select("metrics").eq("scope", "global").maybeSingle(),
  ]);
  if (feedbackError) throw feedbackError;
  if (modelError) throw modelError;
  const balancedAccuracy = Number((model?.metrics as { balanced_accuracy?: number } | null)?.balanced_accuracy ?? 0);
  const summary = summarizeTrainingLabels(feedback ?? []);
  return { ...summary, balancedAccuracy, ready: trainingReady(summary, balancedAccuracy) };
}

export async function getDiagnostics() {
  const [{ data: runs, error: runError }, { data: models, error: modelError }, { data: settings, error: settingsError }] = await Promise.all([
    client().from("ingestion_runs").select("mode,status,stats,error,finished_at").order("created_at", { ascending: false }).limit(10),
    client().from("recommender_models").select("scope,metrics,label_counts,trained_at").eq("scope", "global").maybeSingle(),
    client().from("app_settings").select("max_feed_recommendations,max_today_recommendations,exploration_rate").maybeSingle(),
  ]);
  if (runError) throw runError;
  if (modelError) throw modelError;
  if (settingsError) throw settingsError;
  const runList = runs ?? [];
  return { runs: runList, lastZoteroSync: runList.find((run: { mode: string }) => run.mode === "zotero_sync") ?? null, model: models, apiErrors: runList.filter((run: { status: string }) => run.status === "failed"), guardrails: settings };
}

export async function listRecommendations(feedId?: string): Promise<Recommendation[]> {
  const { data, error } = await client().rpc("list_current_recommendations", { p_feed_id: feedId ?? null, p_limit: 200 });
  if (error) throw error;
  const recommendations = (data ?? []).map((item: Recommendation & { feed_labels?: string[] }) => ({ ...item, feedLabels: item.feed_labels ?? [] }));
  const papers = await addZoteroStatus(recommendations.map((item: Recommendation & { feed_labels?: string[] }) => item.paper));
  const statusByPaper = new Map(papers.map((paper) => [paper.id, paper.in_zotero]));
  return recommendations.map((item: Recommendation & { feed_labels?: string[] }) => ({ ...item, paper: { ...item.paper, in_zotero: statusByPaper.get(item.paper.id) ?? false } }));
}

export async function listPapersByStatus(status: PaperState["status"]): Promise<Array<Paper & { state: PaperState }>> {
  const { data, error } = await client().from("paper_state").select("*, paper:papers(*)").eq("status", status).order("updated_at", { ascending: false });
  if (error) throw error;
  const papers = (data ?? []).map((row: { paper: Paper; status: PaperState["status"]; queue_priority?: QueuePriority | null; rejected_at?: string | null; updated_at?: string | null }) => ({ ...row.paper, state: { status: row.status, queue_priority: row.queue_priority, rejected_at: row.rejected_at, updated_at: row.updated_at } }));
  return addZoteroStatus(papers);
}

export type HistoryPaper = Paper & { state: PaperState; reason_text?: string; recommendation_score?: number; originating_feeds?: string[] };

export async function listRejectedHistory(): Promise<HistoryPaper[]> {
  const papers = await listPapersByStatus("rejected");
  if (!papers.length) return [];
  const { data, error } = await client().from("recommendations").select("paper_id,final_score,reason_text,created_at,feed:feeds(name)").in("paper_id", papers.map((paper) => paper.id)).order("created_at", { ascending: false });
  if (error) throw error;
  const latest = new Map<string, { final_score: number; reason_text: string; feeds: Set<string> }>();
  for (const row of data ?? []) {
    const entry = latest.get(row.paper_id) ?? { final_score: row.final_score, reason_text: row.reason_text, feeds: new Set<string>() };
    const feedName = (row.feed as { name?: string } | null)?.name;
    if (feedName) entry.feeds.add(feedName);
    latest.set(row.paper_id, entry);
  }
  return papers.map((paper) => ({ ...paper, recommendation_score: latest.get(paper.id)?.final_score, reason_text: latest.get(paper.id)?.reason_text, originating_feeds: [...(latest.get(paper.id)?.feeds ?? [])] }));
}

export async function searchLibrary(query: string, filters: { feedId?: string; year?: number; zoteroOnly?: boolean } = {}): Promise<Array<Paper & { state: PaperState }>> {
  let papers = await listPapersByStatus("read");
  if (filters.year) papers = papers.filter((paper) => paper.publication_year === filters.year);
  if (filters.feedId) {
    const { data, error } = await client().from("paper_feed_links").select("paper_id").eq("feed_id", filters.feedId);
    if (error) throw error;
    const linked = new Set((data ?? []).map((row: { paper_id: string }) => row.paper_id));
    papers = papers.filter((paper) => linked.has(paper.id));
  }
  if (filters.zoteroOnly) {
    const { data, error } = await client().from("zotero_items").select("paper_id").not("paper_id", "is", null);
    if (error) throw error;
    const saved = new Set((data ?? []).map((row: { paper_id: string }) => row.paper_id));
    papers = papers.filter((paper) => saved.has(paper.id));
  }
  const needle = query.trim().toLowerCase();
  if (!needle) return papers;
  const { data, error } = await client().from("notebook_pages").select("paper_id,search_text").ilike("search_text", `%${needle}%`);
  if (error) throw error;
  const noteMatches = new Set((data ?? []).map((row: { paper_id: string }) => row.paper_id));
  return papers.filter((paper) => noteMatches.has(paper.id) || [paper.title, paper.abstract ?? "", JSON.stringify(paper.authors)].join(" ").toLowerCase().includes(needle));
}

export async function updatePaperState(paperId: string, action: PaperAction, feedId?: string): Promise<PaperState> {
  const { data, error } = await client().rpc("classify_paper", { p_paper_id: paperId, p_action: action.type, p_feed_id: feedId ?? null, p_priority: action.type === "reclassify" ? action.priority : null });
  if (error) throw error;
  return data as PaperState;
}

export async function requestTrainingBatch(feedId: string | null, batchSize: number) {
  const gateway = import.meta.env.VITE_GATEWAY_URL as string | undefined;
  const token = (await client().auth.getSession()).data.session?.access_token;
  if (!gateway || !token) throw new Error("Gateway or session is not configured");
  const response = await fetch(`${gateway}/api/jobs/training-batch`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ feedId, batchSize }) });
  if (!response.ok) throw new Error("Training batch could not be queued");
  return response.json() as Promise<{ requestId: string; status: string }>;
}

export async function requestZoteroSync() {
  const gateway = import.meta.env.VITE_GATEWAY_URL as string | undefined;
  const token = (await client().auth.getSession()).data.session?.access_token;
  if (!gateway || !token) throw new Error("Gateway or session is not configured");
  const response = await fetch(`${gateway}/api/zotero/sync`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Zotero sync could not be queued");
  return response.json() as Promise<{ requestId: string; status: string }>;
}

export type PaperSource = { id: string; pdf_url: string; landing_url?: string | null; host?: string | null; version_kind?: string | null; is_open_access: boolean };
export type PdfHighlight = { id: string; source_id?: string | null; page_number: number; rects: Array<{ x: number; y: number; width: number; height: number }>; selected_text: string | null };
export type ReaderState = { source_id: string | null; page_number: number; zoom: number; scroll_offset: number };

export async function getReaderState(paperId: string): Promise<ReaderState | null> {
  const { data, error } = await client().from("reader_state").select("source_id,page_number,zoom,scroll_offset").eq("paper_id", paperId).maybeSingle();
  if (error) throw error;
  return data as ReaderState | null;
}

export async function saveReaderState(paperId: string, state: ReaderState) {
  const user = await currentUser();
  const { error } = await client().from("reader_state").upsert({ user_id: user.id, paper_id: paperId, ...state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function listPaperSources(paperId: string): Promise<PaperSource[]> {
  const { data, error } = await client().from("paper_sources").select("id,pdf_url,landing_url,host,version_kind,is_open_access").eq("paper_id", paperId).eq("is_open_access", true);
  if (error) throw error;
  return (data ?? []).filter((source: PaperSource) => source.pdf_url) as PaperSource[];
}

export async function getPaper(paperId: string): Promise<Paper> {
  const { data, error } = await client().from("papers").select("*").eq("id", paperId).single();
  if (error) throw error;
  return (await addZoteroStatus([data as Paper]))[0];
}

export async function listHighlights(paperId: string): Promise<PdfHighlight[]> {
  const { data, error } = await client().from("pdf_highlights").select("id,source_id,page_number,rects,selected_text").eq("paper_id", paperId).order("created_at");
  if (error) throw error;
  return data as PdfHighlight[];
}

export async function saveHighlight(paperId: string, pageNumber: number, rects: PdfHighlight["rects"], selectedText: string, sourceId?: string) {
  const user = await currentUser();
  const { data, error } = await client().from("pdf_highlights").insert({ user_id: user.id, paper_id: paperId, source_id: sourceId ?? null, page_number: pageNumber, rects, selected_text: selectedText }).select().single();
  if (error) throw error;
  return data as PdfHighlight;
}

export async function deleteHighlight(highlightId: string) {
  const { error } = await client().from("pdf_highlights").delete().eq("id", highlightId);
  if (error) throw error;
}

export type StoredNotebookPage = { id: string; page_index: number; objects: import("../features/notebook/notebookModel").NotebookObject[]; search_text: string; version: number };

export async function listNotebookPages(paperId: string): Promise<StoredNotebookPage[]> {
  const { data, error } = await client().from("notebook_pages").select("id,page_index,objects,search_text,version").eq("paper_id", paperId).order("page_index");
  if (error) throw error;
  return data as StoredNotebookPage[];
}

export async function saveNotebookPage(paperId: string, pageIndex: number, objects: StoredNotebookPage["objects"], version: number): Promise<StoredNotebookPage> {
  const user = await currentUser();
  const searchText = objects.filter((object) => object.type === "text").map((object) => object.text.trim()).filter(Boolean).join(" ");
  const { data: existing, error: readError } = await client().from("notebook_pages").select("id,version").eq("paper_id", paperId).eq("page_index", pageIndex).maybeSingle();
  if (readError) throw readError;
  if (existing && existing.version !== version) throw new Error("Notebook changed elsewhere. Reload latest or keep this copy as a new page.");
  const next = { user_id: user.id, paper_id: paperId, page_index: pageIndex, objects, search_text: searchText, version: version + 1, updated_at: new Date().toISOString() };
  const query = existing
    ? client().from("notebook_pages").update(next).eq("id", existing.id).eq("version", version).select("id,page_index,objects,search_text,version").maybeSingle()
    : client().from("notebook_pages").insert(next).select("id,page_index,objects,search_text,version").single();
  const { data, error } = await query;
  if (error) {
    if (!existing && (error as { code?: string }).code === "23505") throw new Error("Notebook changed elsewhere. Reload latest or keep this copy as a new page.");
    throw error;
  }
  if (!data) throw new Error("Notebook changed elsewhere. Reload latest or keep this copy as a new page.");
  return data as StoredNotebookPage;
}

export async function deleteNotebookPage(pageId: string) {
  const { error } = await client().from("notebook_pages").delete().eq("id", pageId);
  if (error) throw error;
}

export async function setNotebookPageIndex(pageId: string, pageIndex: number) {
  const { error } = await client().from("notebook_pages").update({ page_index: pageIndex }).eq("id", pageId);
  if (error) throw error;
}

export async function addToZotero(paperId: string, feedId?: string) {
  const gateway = import.meta.env.VITE_GATEWAY_URL as string | undefined;
  const token = (await client().auth.getSession()).data.session?.access_token;
  if (!gateway || !token) throw new Error("Gateway or session is not configured");
  const response = await fetch(`${gateway}/api/zotero/add`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ paperId }) });
  if (!response.ok) throw new Error("Could not add paper to Zotero");
  const result = await response.json() as { status: string; zoteroKey: string };
  const user = await currentUser();
  const { error } = await client().from("feedback_events").insert({ user_id: user.id, paper_id: paperId, feed_id: feedId ?? null, event_type: "add_to_zotero", label: "add_to_zotero", weight: 0.3 });
  if (error) throw error;
  return result;
}
