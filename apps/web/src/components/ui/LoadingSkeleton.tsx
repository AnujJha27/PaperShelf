import { Skeleton, Stack } from "@mui/material";

export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return <Stack spacing={1.5} aria-label="Loading"><Skeleton variant="rounded" height={28} width="55%" />{Array.from({ length: lines }, (_, index) => <Skeleton key={index} variant="rounded" height={index === lines - 1 ? 44 : 18} width={index === lines - 1 ? "88%" : "100%"} />)}</Stack>;
}
