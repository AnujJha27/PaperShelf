import { Card, CardContent, Divider, Link as MuiLink, Stack, Typography } from "@mui/material";
import type { Paper, PaperAction } from "@paper-radar/shared";
import { Link } from "react-router-dom";
import { FeedBadge } from "../../components/ui/FeedBadge";
import { AbstractPreview } from "./components/AbstractPreview";
import { PaperActions } from "./components/PaperActions";
import { PaperMetadata } from "./components/PaperMetadata";
import { RecommendationBadge } from "./components/RecommendationBadge";
import { TopicChips } from "./components/TopicChips";

type PaperCardProps = {
  paper: Paper;
  reason?: string;
  score?: number;
  components?: Record<string, number>;
  feedLabel?: string;
  feedLabels?: string[];
  topics?: string[];
  abstractMode?: "preview" | "full" | "compact";
  onAction: (action: PaperAction) => void;
  onAddToZotero?: () => void;
  actions?: PaperAction["type"][];
};

export function PaperCard({ paper, score, feedLabel, feedLabels, topics, abstractMode = "preview", onAction, onAddToZotero, actions = ["relevant", "maybe", "not_relevant"] }: PaperCardProps) {
  const labels = feedLabels?.length ? feedLabels : feedLabel ? [feedLabel] : [];
  return <Card component="article" sx={{ mb: 2 }}>
    <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}>
          <Typography component="h2" variant="h2" sx={{ maxWidth: 900 }}>{paper.title}</Typography>
          <RecommendationBadge score={score} />
        </Stack>
        <PaperMetadata paper={paper} />
        {labels.length > 0 && <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}><Typography variant="caption" color="text.secondary">Feeds:</Typography><span className="sr-only">Feeds: {labels.join(", ")}</span>{labels.map((label) => <FeedBadge key={label} name={label} />)}</Stack>}
        <TopicChips topics={topics} />
        {paper.in_zotero && <Typography variant="caption" color="success.main">✓ In Zotero</Typography>}
        <AbstractPreview text={paper.abstract} mode={abstractMode} />
        <Divider />
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1.5 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <MuiLink component={Link} to={`/reading/${paper.id}`} underline="hover" sx={{ alignSelf: "center", fontSize: "0.82rem" }}>Read with notes</MuiLink>
            {paper.canonical_url && <MuiLink href={paper.canonical_url} target="_blank" rel="noreferrer" underline="hover" sx={{ alignSelf: "center", fontSize: "0.82rem" }}>Open paper</MuiLink>}
          </Stack>
          <PaperActions actions={actions} onAction={onAction} onAddToZotero={onAddToZotero} inZotero={paper.in_zotero} />
        </Stack>
      </Stack>
    </CardContent>
  </Card>;
}
