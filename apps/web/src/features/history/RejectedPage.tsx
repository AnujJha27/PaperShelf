import { StatusPage } from "../workflow/StatusPage";

export function RejectedPage() {
  return <StatusPage status="rejected" title="Rejected" actions={["undo_rejection", "reclassify"]} />;
}
