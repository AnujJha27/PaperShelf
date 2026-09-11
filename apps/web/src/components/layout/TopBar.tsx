import { Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useThemeMode } from "../../theme";

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedMode, setMode } = useThemeMode();
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("q") ?? "");
  function search(event: FormEvent) {
    event.preventDefault();
    navigate(query.trim() ? `/library?q=${encodeURIComponent(query.trim())}` : "/library");
  }
  return <Box component="header" sx={{ height: 68, borderBottom: 1, borderColor: "divider", bgcolor: "background.default", display: "flex", alignItems: "center", px: { xs: 1.5, sm: 3 }, gap: 1.5, position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(12px)" }}>
    <IconButton onClick={onMenu} aria-label="Open navigation" sx={{ display: { md: "none" } }}>☰</IconButton>
    <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", sm: "block" }, minWidth: 52 }}>Workspace</Typography>
    <Box component="form" onSubmit={search} sx={{ flex: 1, maxWidth: 520 }}><TextField fullWidth size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library and notes" slotProps={{ htmlInput: { "aria-label": "Search library and notes" } }} /></Box>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <Tooltip title={`Use ${resolvedMode === "dark" ? "light" : "dark"} theme`}><IconButton onClick={() => setMode(resolvedMode === "dark" ? "light" : "dark")} aria-label="Toggle theme">{resolvedMode === "dark" ? "☼" : "☾"}</IconButton></Tooltip>
      <Button size="small" color="inherit" onClick={() => navigate("/settings")} sx={{ display: { xs: "none", sm: "inline-flex" } }}>Account</Button>
    </Stack>
  </Box>;
}
