import type { Paper, PaperAction } from "@paper-radar/shared";
import { Link } from "react-router-dom";

function authorsText(authors: Paper["authors"]) {
  return authors.map((author) => typeof author === "string" ? author : author.name ?? author.display_name ?? "").filter(Boolean).join(", ");
}

export function PaperCard({ paper, reason, score, components, feedLabel, feedLabels, onAction, onAddToZotero, actions = ["relevant", "maybe", "not_relevant"] }: { paper: Paper; reason?: string; score?: number; components?: Record<string, number>; feedLabel?: string; feedLabels?: string[]; onAction: (action: PaperAction) => void; onAddToZotero?: () => void; actions?: PaperAction["type"][] }) {
  const labels = feedLabels?.length ? feedLabels : feedLabel ? [feedLabel] : [];
  return <article>
    <h2>{paper.title}</h2>
    <p>{authorsText(paper.authors)}{paper.venue ? ` · ${paper.venue}` : ""}{paper.publication_year ? ` · ${paper.publication_year}` : ""}</p>
    {labels.length > 0 && <p><small>Feeds: {labels.join(", ")}</small></p>}
    {reason && <p><em>{reason}</em></p>}
    {score !== undefined && <details><summary>Recommendation score</summary><p>{score.toFixed(3)}</p>{components && <ul>{Object.entries(components).map(([name, value]) => <li key={name}>{name}: {value.toFixed(3)}</li>)}</ul>}</details>}
    {paper.in_zotero && <p><small>In Zotero</small></p>}
    <p>{paper.abstract || "No abstract available."}</p>
    <p><Link to={`/reading/${paper.id}`}>Read with notes</Link></p>
    {paper.canonical_url && <p><a href={paper.canonical_url} target="_blank" rel="noreferrer">Open paper</a></p>}
    <div>
      {actions.map((action) => action === "reclassify" ? <span key={action}><button onClick={() => onAction({ type: action, priority: "maybe" })}>Move to Queue as Maybe</button><button onClick={() => onAction({ type: action, priority: "relevant" })}>Move to Queue as Relevant</button></span> : <button key={action} onClick={() => onAction({ type: action } as PaperAction)}>
        {action === "not_relevant" ? "Not relevant" : action === "relevant" ? "Relevant" : action === "maybe" ? "Maybe" : action === "start_reading" ? "Start reading" : action === "mark_read" ? "Mark read" : action === "undo_rejection" ? "Undo rejection" : "Action"}
      </button>)}
      {onAddToZotero && !paper.in_zotero && <button onClick={onAddToZotero}>Add to Zotero</button>}
    </div>
  </article>;
}
