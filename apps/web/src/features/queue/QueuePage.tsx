import { StatusPage } from "../workflow/StatusPage";

export function QueuePage() {
  return <StatusPage status="queue" title="Queue" actions={["start_reading", "relevant", "maybe", "not_relevant"]} groupQueue />;
}
