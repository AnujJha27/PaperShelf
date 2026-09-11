import { Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <Paper sx={{ p: { xs: 3, md: 5 }, textAlign: "center", borderStyle: "dashed" }}><Stack spacing={1.5} sx={{ alignItems: "center" }}><Typography variant="h3">{title}</Typography>{description && <Typography color="text.secondary" sx={{ maxWidth: 520 }}>{description}</Typography>}{action}</Stack></Paper>;
}
