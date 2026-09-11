import type { PaletteOptions } from "@mui/material/styles";
import { darkTokens } from "./tokens";

export const darkPalette: PaletteOptions = {
  mode: "dark",
  primary: { main: darkTokens.accent, light: darkTokens.accentHover, dark: darkTokens.accentSoft, contrastText: "#071115" },
  background: { default: darkTokens.background, paper: darkTokens.paper },
  text: { primary: darkTokens.text, secondary: darkTokens.textMuted, disabled: darkTokens.textFaint },
  divider: darkTokens.border,
  success: { main: darkTokens.success },
  warning: { main: darkTokens.warning },
  error: { main: darkTokens.danger },
  info: { main: darkTokens.info },
};
