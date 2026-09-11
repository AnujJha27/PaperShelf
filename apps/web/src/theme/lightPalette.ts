import type { PaletteOptions } from "@mui/material/styles";
import { lightTokens } from "./tokens";

export const lightPalette: PaletteOptions = {
  mode: "light",
  primary: { main: lightTokens.accent, light: lightTokens.accentHover, dark: lightTokens.accentSoft, contrastText: "#FFFFFF" },
  background: { default: lightTokens.background, paper: lightTokens.paper },
  text: { primary: lightTokens.text, secondary: lightTokens.textMuted, disabled: lightTokens.textFaint },
  divider: lightTokens.border,
  success: { main: lightTokens.success },
  warning: { main: lightTokens.warning },
  error: { main: lightTokens.danger },
  info: { main: lightTokens.info },
};
