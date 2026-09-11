import { Box, Button, Typography } from "@mui/material";
import { useState } from "react";

export function AbstractPreview({ text, mode = "preview", defaultExpanded = false }: { text?: string | null; mode?: "preview" | "full" | "compact"; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded || mode === "full");
  const value = text || "No abstract available.";
  const collapsible = mode !== "full" && value.length > 280;
  return <Box><Typography variant="body2" color="text.secondary" className={!expanded && collapsible ? "abstract-preview" : undefined}>{value}</Typography>{collapsible && <Button size="small" onClick={() => setExpanded((current) => !current)} sx={{ px: 0, mt: 0.5 }}>{expanded ? "Show less" : "Read abstract"}</Button>}</Box>;
}
