import { Box, ListItemButton, ListItemText } from "@mui/material";
import type { Feed } from "@paper-radar/shared";
import { Link } from "react-router-dom";
import { feedColor } from "../../theme";

export function FeedNavItem({ feed, collapsed, onClick }: { feed: Feed; collapsed?: boolean; onClick?: () => void }) {
  return <ListItemButton component={Link} to={`/?feed=${encodeURIComponent(feed.id)}`} onClick={onClick} title={collapsed ? feed.name : undefined} sx={{ justifyContent: collapsed ? "center" : "flex-start", px: collapsed ? 1 : 1.5 }}>
    <Box aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: feedColor(feed.name), flexShrink: 0, mr: collapsed ? 0 : 1.25 }} />
    {!collapsed && <ListItemText primary={feed.name} slotProps={{ primary: { noWrap: true, variant: "body2" } }} sx={{ m: 0 }} />}
  </ListItemButton>;
}
