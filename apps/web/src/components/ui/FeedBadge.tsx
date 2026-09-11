import { Chip } from "@mui/material";
import { feedColor } from "../../theme";

export function FeedBadge({ name }: { name: string }) {
  return <Chip size="small" label={name} variant="outlined" sx={{ borderColor: feedColor(name), color: feedColor(name), maxWidth: 180 }} />;
}
