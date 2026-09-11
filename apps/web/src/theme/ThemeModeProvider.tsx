import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { CssBaseline, ThemeProvider, useMediaQuery } from "@mui/material";
import { createAppTheme } from "./createAppTheme";
import type { ThemeMode } from "./tokens";

const storageKey = "paper-radar-theme";
const ThemeModeContext = createContext<{ mode: ThemeMode; resolvedMode: "dark" | "light"; setMode: (mode: ThemeMode) => void }>({ mode: "dark", resolvedMode: "dark", setMode: () => undefined });

function readMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const value = window.localStorage.getItem(storageKey);
  return value === "light" || value === "system" || value === "dark" ? value : "dark";
}

export function ThemeModeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>(readMode);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedMode = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
  const theme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);

  useEffect(() => { window.localStorage.setItem(storageKey, mode); }, [mode]);

  return <ThemeModeContext.Provider value={{ mode, resolvedMode, setMode }}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></ThemeModeContext.Provider>;
}

export function useThemeMode() {
  return useContext(ThemeModeContext);
}
