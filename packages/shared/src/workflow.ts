export type PaperStatus = "inbox" | "queue" | "reading" | "read" | "rejected";
export type QueuePriority = "relevant" | "maybe";
export type PaperState = { status: PaperStatus; queue_priority?: QueuePriority | null; rejected_at?: string | null; updated_at?: string | null };
export type PaperAction =
  | { type: "relevant" }
  | { type: "maybe" }
  | { type: "not_relevant" }
  | { type: "start_reading" }
  | { type: "mark_read" }
  | { type: "undo_rejection" }
  | { type: "reclassify"; priority: QueuePriority };

export function transitionPaperState(state: PaperState, action: PaperAction): PaperState {
  switch (action.type) {
    case "relevant": return { status: "queue", queue_priority: "relevant" };
    case "maybe": return { status: "queue", queue_priority: "maybe" };
    case "not_relevant": return { status: "rejected" };
    case "start_reading": return state.status === "queue" || state.status === "inbox" ? { status: "reading", queue_priority: null } : state;
    case "mark_read": return state.status === "reading" ? { status: "read", queue_priority: null } : state;
    case "undo_rejection": return state.status === "rejected" ? { status: "inbox" } : state;
    case "reclassify": return state.status === "rejected" ? { status: "queue", queue_priority: action.priority } : state;
  }
}
