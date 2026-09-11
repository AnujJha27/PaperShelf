import { Stack } from "@mui/material";
import { TopicChip } from "../../../components/ui/TopicChip";

export function TopicChips({ topics = [] }: { topics?: string[] }) {
  const visible = topics.filter(Boolean).slice(0, 5);
  if (!visible.length) return null;
  return <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>{visible.map((topic) => <TopicChip key={topic} label={topic} />)}{topics.length > visible.length && <TopicChip label={`+${topics.length - visible.length}`} />}</Stack>;
}
