import { Container } from "@mui/material";
import type { ReactNode } from "react";

export function PageContainer({ children }: { children: ReactNode }) {
  return <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5.5 }, px: { xs: 2, sm: 4, lg: 6 } }}>{children}</Container>;
}
