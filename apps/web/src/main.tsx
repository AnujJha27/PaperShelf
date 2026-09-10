import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppRouter } from "./app/router";
import { queryClient } from "./app/queryClient";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js");
}
