import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function SectionHeader({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  return <Stack direction="row" sx={{ mb: 1.5, alignItems: "center", justifyContent: "space-between" }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Typography component="h2" variant="h2">{title}</Typography>{count !== undefined && <Typography variant="caption" color="text.secondary">{count}</Typography>}</Stack>{action}</Stack>;
}
