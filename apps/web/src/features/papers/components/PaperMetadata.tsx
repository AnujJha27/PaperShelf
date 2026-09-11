import { Stack, Typography } from "@mui/material";
import type { Paper } from "@paper-radar/shared";

export function authorsText(authors: Paper["authors"]) {
  return authors.map((author) => typeof author === "string" ? author : author.name ?? author.display_name ?? "").filter(Boolean).join(", ");
}

export function PaperMetadata({ paper }: { paper: Paper }) {
  const values = [authorsText(paper.authors), paper.venue, paper.publication_year ? String(paper.publication_year) : undefined].filter(Boolean);
  return <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}><Typography variant="body2" color="text.secondary">{values.join(" · ") || "Metadata unavailable"}</Typography></Stack>;
}
