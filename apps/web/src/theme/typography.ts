import type { TypographyVariantsOptions } from "@mui/material/styles";

export const typography: TypographyVariantsOptions = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  h1: { fontSize: "2rem", lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.03em" },
  h2: { fontSize: "1.2rem", lineHeight: 1.35, fontWeight: 650, letterSpacing: "-0.015em" },
  h3: { fontSize: "1rem", lineHeight: 1.4, fontWeight: 650 },
  body1: { fontSize: "0.95rem", lineHeight: 1.6 },
  body2: { fontSize: "0.82rem", lineHeight: 1.5 },
  caption: { fontSize: "0.72rem", lineHeight: 1.4, letterSpacing: "0.01em" },
  button: { fontWeight: 650, textTransform: "none" },
};
