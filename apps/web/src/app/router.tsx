import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthGate } from "../auth/AuthGate";
import { App } from "./App";
import { FeedsPage } from "../features/feeds/FeedsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TodayPage } from "../features/inbox/TodayPage";
import { QueuePage } from "../features/queue/QueuePage";
import { ReadingPage } from "../features/reading/ReadingPage";
import { LibraryPage } from "../features/library/LibraryPage";
import { RejectedPage } from "../features/history/RejectedPage";
import { ReaderPage } from "../features/reader/ReaderPage";
import { AppShell } from "../components/layout/AppShell";

export const routePaths = [
  "/",
  "/feeds",
  "/queue",
  "/reading",
  "/library",
  "/history/rejected",
  "/training",
  "/settings",
] as const;

function Shell() {
  return (
    <AppShell>
      <Routes>
        <Route path="/reading/:paperId" element={<ReaderPage />} />
        {routePaths.map((path) => (
          <Route key={path} path={path} element={
            path === "/" ? <TodayPage /> :
            path === "/feeds" ? <FeedsPage /> :
            path === "/queue" ? <QueuePage /> :
            path === "/reading" ? <ReadingPage /> :
            path === "/library" ? <LibraryPage /> :
            path === "/history/rejected" ? <RejectedPage /> :
            path === "/training" ? <TodayPage training /> :
            path === "/settings" ? <SettingsPage /> : <App />
          } />
        ))}
      </Routes>
    </AppShell>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Shell />
      </AuthGate>
    </BrowserRouter>
  );
}
