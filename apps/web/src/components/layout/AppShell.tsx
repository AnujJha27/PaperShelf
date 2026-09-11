import { Box, useMediaQuery, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { useState } from "react";
import { ResponsiveDrawer } from "./ResponsiveDrawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
    {desktop ? <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} /> : <ResponsiveDrawer open={mobileOpen} onClose={() => setMobileOpen(false)}><Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} /></ResponsiveDrawer>}
    <Box sx={{ flex: 1, minWidth: 0 }}><TopBar onMenu={() => setMobileOpen(true)} /><Box component="main">{children}</Box></Box>
  </Box>;
}
