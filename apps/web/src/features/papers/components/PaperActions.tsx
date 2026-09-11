import { Button, Stack } from "@mui/material";
import type { PaperAction } from "@paper-radar/shared";

const labels: Record<PaperAction["type"], string> = { relevant: "Relevant", maybe: "Maybe", not_relevant: "Nope", start_reading: "Start reading", mark_read: "Mark read", undo_rejection: "Undo rejection", reclassify: "Move" };

export function PaperActions({ actions, onAction, onAddToZotero, inZotero }: { actions: PaperAction["type"][]; onAction: (action: PaperAction) => void; onAddToZotero?: () => void; inZotero?: boolean }) {
  return <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ alignItems: { xs: "stretch", sm: "center" }, flexWrap: "wrap" }}>
    {actions.map((action) => action === "reclassify" ? <Stack direction="row" spacing={1} key={action}><Button size="small" variant="outlined" onClick={() => onAction({ type: action, priority: "maybe" })}>Queue as Maybe</Button><Button size="small" variant="contained" onClick={() => onAction({ type: action, priority: "relevant" })}>Queue as Relevant</Button></Stack> : <Button key={action} size="small" variant={action === "relevant" || action === "mark_read" ? "contained" : action === "maybe" ? "outlined" : "text"} color={action === "not_relevant" ? "inherit" : "primary"} onClick={() => onAction({ type: action } as PaperAction)}>{labels[action]}</Button>)}
    {onAddToZotero && !inZotero && <Button size="small" variant="text" onClick={onAddToZotero}>Save to Zotero</Button>}
  </Stack>;
}
