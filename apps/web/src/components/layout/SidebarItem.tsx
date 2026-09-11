import { ListItemButton, ListItemText } from "@mui/material";
import { NavLink } from "react-router-dom";

export function SidebarItem({ to, label, collapsed, end = false, onClick }: { to: string; label: string; collapsed?: boolean; end?: boolean; onClick?: () => void }) {
  return <ListItemButton component={NavLink} to={to} end={end} onClick={onClick} title={collapsed ? label : undefined} sx={{ justifyContent: collapsed ? "center" : "flex-start", px: collapsed ? 1 : 1.5, py: 1, borderRadius: 2, "&.active": { color: "primary.main", bgcolor: "action.selected", fontWeight: 650 }, "&:hover": { bgcolor: "action.hover" } }}>
    <ListItemText primary={label} sx={{ display: collapsed ? "none" : "block", m: 0 }} />
    {collapsed && <span aria-hidden="true">{label.slice(0, 1)}</span>}
  </ListItemButton>;
}
