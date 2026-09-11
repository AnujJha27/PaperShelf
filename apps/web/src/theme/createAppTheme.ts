import { createTheme } from "@mui/material/styles";
import { components } from "./components";
import { darkPalette } from "./darkPalette";
import { lightPalette } from "./lightPalette";
import { typography } from "./typography";

export function createAppTheme(mode: "dark" | "light") {
  return createTheme({
    palette: mode === "dark" ? darkPalette : lightPalette,
    typography,
    shape: { borderRadius: 10 },
    spacing: 4,
    components,
  });
}
