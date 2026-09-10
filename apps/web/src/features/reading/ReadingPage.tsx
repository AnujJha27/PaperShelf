import { StatusPage } from "../workflow/StatusPage";

export function ReadingPage() {
  return <StatusPage status="reading" title="Reading" actions={["mark_read", "not_relevant"]} />;
}
