import { Chip } from "@mui/material";

export function TopicChip({ label }: { label: string }) {
  return <Chip size="small" label={label} variant="outlined" sx={{ color: "text.secondary", borderColor: "divider" }} />;
}
