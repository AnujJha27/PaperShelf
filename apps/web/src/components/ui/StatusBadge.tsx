import { Chip } from "@mui/material";

export function StatusBadge({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  return <Chip size="small" label={label} color={tone === "danger" ? "error" : tone} variant={tone === "default" ? "outlined" : "filled"} />;
}
