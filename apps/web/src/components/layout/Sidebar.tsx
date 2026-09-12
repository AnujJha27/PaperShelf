import { Box, Divider, IconButton, List, Stack, Tooltip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { Feed } from "@paper-radar/shared";
import { listFeeds } from "../../lib/api";
import { appName } from "../../app/App";
import { FeedNavItem } from "./FeedNavItem";
import { SidebarItem } from "./SidebarItem";

const primaryItems = [
  ["/", "Today"], ["/feeds", "Feeds"], ["/queue", "Queue"], ["/reading", "Reading"], ["/library", "Library"], ["/history/rejected", "Rejected"], ["/training", "Training"],
] as const;

export function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const feeds = useQuery<Feed[]>({ queryKey: ["feeds"], queryFn: listFeeds });
  return <Box component="aside" sx={{ width: collapsed ? 64 : 244, flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto", borderRight: 1, borderColor: "divider", bgcolor: "background.paper", transition: "width 160ms ease", display: "flex", flexDirection: "column" }}>
    <Stack direction="row" sx={{ minHeight: 68, px: collapsed ? 1 : 2, alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
      {!collapsed && <Typography variant="h2" component="div" noWrap>{appName}</Typography>}
      <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"}><IconButton size="small" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? ">" : "<"}</IconButton></Tooltip>
    </Stack>
    <Divider />
    <List component="nav" aria-label="Main navigation" disablePadding sx={{ p: 1 }}>
      {primaryItems.map(([to, label]) => <SidebarItem key={to} to={to} label={label} collapsed={collapsed} end={to === "/"} onClick={onNavigate} />)}
    </List>
    {!collapsed && <>
      <Typography variant="overline" color="text.secondary" sx={{ px: 2, mt: 1 }}>Feeds</Typography>
      <List disablePadding sx={{ px: 1 }}>{feeds.data?.filter((feed) => feed.is_active).map((feed) => <FeedNavItem key={feed.id} feed={feed} onClick={onNavigate} />)}</List>
    </>}
    <Box sx={{ flex: 1 }} />
    <List disablePadding sx={{ p: 1 }}><SidebarItem to="/settings" label="Settings" collapsed={collapsed} onClick={onNavigate} /></List>
  </Box>;
}
