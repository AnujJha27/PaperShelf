import { Drawer } from "@mui/material";
import type { ReactNode } from "react";

export function ResponsiveDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return <Drawer open={open} onClose={onClose} sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: 232 } }}>{children}</Drawer>;
}
