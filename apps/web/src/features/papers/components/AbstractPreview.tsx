import { Box, Button, Typography } from "@mui/material";
import { useState } from "react";

export function AbstractPreview({ text, mode = "preview", defaultExpanded = false }: { text?: string | null; mode?: "preview" | "full" | "compact"; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded || mode === "full");
  const value = text || "No abstract available.";
  const collapsible = mode !== "full" && value.length > 280;
  return <Box sx={{ maxWidth: "82ch", p: { xs: 1.5, sm: 2 }, border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "action.hover" }}>
    <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.5, letterSpacing: "0.08em" }}>Abstract</Typography>
    <Typography variant={mode === "full" ? "body1" : "body2"} color="text.secondary" className={!expanded && collapsible ? "abstract-preview" : undefined} sx={{ lineHeight: mode === "full" ? 1.8 : 1.6, maxWidth: "78ch" }}>{value}</Typography>
    {collapsible && <Button size="small" onClick={() => setExpanded((current) => !current)} sx={{ px: 0, mt: 0.75 }}>{expanded ? "Show less" : "Read abstract"}</Button>}
  </Box>;
}
