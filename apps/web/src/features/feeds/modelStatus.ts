export type FeedLabelEvent = { paper_id?: string | null; label?: string | null; event_type?: string | null; created_at?: string | null };
export type FeedModelRow = { metrics?: { balanced_accuracy?: number } | null };
export type FeedModelStatus = { feedId: string; status: "Cold start" | "Training" | "Ready"; total: number; relevant: number; maybe: number; notRelevant: number; balancedAccuracy: number };

export function summarizeFeedModel(feedId: string, events: FeedLabelEvent[], model: FeedModelRow | null): FeedModelStatus {
  const latest = new Map<string, FeedLabelEvent>();
  const loose: FeedLabelEvent[] = [];
  for (const event of [...events].sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")))) {
    const label = String(event.label ?? event.event_type ?? "");
    if (["relevant", "maybe", "not_relevant"].includes(label)) {
      if (event.paper_id) latest.set(event.paper_id, event);
      else loose.push(event);
    } else if (label === "undo_rejection" && event.paper_id) {
      latest.delete(event.paper_id);
    }
  }
  let relevant = 0;
  let maybe = 0;
  let notRelevant = 0;
  for (const event of [...loose, ...latest.values()]) {
    const label = String(event.label ?? event.event_type ?? "");
    if (label === "relevant") relevant += 1;
    else if (label === "maybe") maybe += 1;
    else if (label === "not_relevant") notRelevant += 1;
  }
  const total = relevant + maybe + notRelevant;
  return { feedId, status: model ? "Ready" : total ? "Training" : "Cold start", total, relevant, maybe, notRelevant, balancedAccuracy: Number(model?.metrics?.balanced_accuracy ?? 0) };
}
