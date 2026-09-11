import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppRouter } from "./app/router";
import { queryClient } from "./app/queryClient";
import { ThemeModeProvider } from "./theme";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeModeProvider>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>
    </ThemeModeProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js");
}
