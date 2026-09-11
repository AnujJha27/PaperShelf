import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <Stack direction={{ xs: "column", sm: "row" }} sx={{ mb: 4.5, justifyContent: "space-between", alignItems: { xs: "stretch", sm: "flex-start" }, gap: 2.5 }}><Box><Typography component="h1" variant="h1">{title}</Typography>{description && <Typography color="text.secondary" sx={{ mt: 1.25, maxWidth: 720 }}>{description}</Typography>}</Box>{action}</Stack>;
}
