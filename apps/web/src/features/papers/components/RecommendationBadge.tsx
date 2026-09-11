import { StatusBadge } from "../../../components/ui/StatusBadge";

export function RecommendationBadge({ score }: { score?: number }) {
  if (score === undefined) return null;
  const label = score >= 0.75 ? "Strong match" : score >= 0.5 ? "Good match" : "Exploratory";
  return <span aria-label="Recommendation score"><StatusBadge label={label} tone={score >= 0.75 ? "success" : score >= 0.5 ? "info" : "default"} /></span>;
}
