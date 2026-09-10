export type TrainingLabelEvent = { paper_id?: string | null; label?: string | null; event_type?: string | null; feed_id?: string | null; created_at?: string | null };
export type TrainingLabelSummary = { total: number; relevant: number; maybe: number; positive: number; negative: number; feedCoverage: number };

export function summarizeTrainingLabels(events: TrainingLabelEvent[]): TrainingLabelSummary {
  let relevant = 0;
  let maybe = 0;
  let negative = 0;
  const feeds = new Set<string>();
  const latest = new Map<string, TrainingLabelEvent>();
  const loose: TrainingLabelEvent[] = [];
  for (const event of [...events].sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")))) {
    const label = String(event.label ?? event.event_type ?? "");
    if (["relevant", "maybe", "not_relevant"].includes(label)) {
      if (event.paper_id) latest.set(event.paper_id, event);
      else loose.push(event);
    } else if (label === "undo_rejection" && event.paper_id) {
      latest.delete(event.paper_id);
    }
  }
  for (const event of [...loose, ...latest.values()]) {
    const label = String(event.label ?? event.event_type ?? "");
    if (event.feed_id) feeds.add(event.feed_id);
    if (label === "relevant") relevant += 1;
    else if (label === "maybe") maybe += 1;
    else if (label === "not_relevant") negative += 1;
  }
  return { total: relevant + maybe + negative, relevant, maybe, positive: relevant + maybe, negative, feedCoverage: feeds.size };
}

export function trainingReady(summary: Pick<TrainingLabelSummary, "total" | "relevant" | "negative">, balancedAccuracy: number): boolean {
  return summary.total >= 60 && summary.relevant >= 15 && summary.negative >= 15 && balancedAccuracy >= 0.6;
}
