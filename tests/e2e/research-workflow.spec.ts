import { expect, test } from "@playwright/test";

const user = { id: "user-1", email: "researcher@example.test" };
const feed = { id: "feed-1", user_id: user.id, name: "Methods", description: "Formal methods", include_keywords: ["proof"], exclude_keywords: [], priority_keywords: [], min_semantic_similarity: 0.35, min_publication_year: 2018, is_active: true };
const papers = [
  { id: "paper-1", title: "Proof certificates", abstract: "A full fixture abstract.", authors: [{ name: "A Researcher" }], venue: "Journal", publication_year: 2026, canonical_url: "https://paper.test/1" },
  { id: "paper-2", title: "Rejected fixture", abstract: "Another fixture abstract.", authors: [{ name: "B Researcher" }], venue: "Journal", publication_year: 2026, canonical_url: "https://paper.test/2" },
];

function fixturePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 56 >>\nstream\nBT /F1 18 Tf 72 720 Td (Fixture paper text) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test("triages, reads, annotates, completes, rejects, and recovers papers", async ({ page }) => {
  const states: Record<string, { status: string; queue_priority?: string | null }> = {};
  let notebook = false;
  let highlight = false;
  await page.addInitScript(({ accessToken, session }) => {
    localStorage.setItem("sb-supabase-auth-token", JSON.stringify({ access_token: accessToken, refresh_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: session }));
  }, { accessToken: "fixture-token", session: user });
  await page.route("https://supabase.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/feeds") {
      if (request.method() === "POST") return route.fulfill({ json: [feed] });
      return route.fulfill({ json: [feed] });
    }
    if (url.pathname === "/rest/v1/recommendations" || url.pathname === "/rest/v1/rpc/list_current_recommendations") {
      const visible = papers.filter((paper) => !states[paper.id] || states[paper.id].status === "inbox");
      return route.fulfill({ json: visible.map((paper) => ({ id: `rec-${paper.id}`, paper_id: paper.id, feed_id: feed.id, final_score: 0.8, components: { semantic_similarity: 0.3 }, reason_text: "Fixture scope match", created_at: "2026-09-07T00:00:00Z", paper, feed, state: states[paper.id] ?? null })) });
    }
    if (url.pathname === "/rest/v1/rpc/classify_paper") {
      const parsed = JSON.parse(request.postData() ?? "{}");
      const action = parsed.p_action as string;
      const paperId = parsed.p_paper_id as string;
      const current = states[paperId]?.status ?? "inbox";
      const next = action === "relevant" || action === "maybe" ? "queue" : action === "not_relevant" ? "rejected" : action === "start_reading" && ["inbox", "queue"].includes(current) ? "reading" : action === "mark_read" && current === "reading" ? "read" : action === "undo_rejection" && current === "rejected" ? "inbox" : action === "reclassify" && current === "rejected" ? "queue" : current;
      states[paperId] = { status: next, queue_priority: next === "queue" ? action === "maybe" || parsed.p_priority === "maybe" ? "maybe" : "relevant" : null };
      return route.fulfill({ json: states[paperId] });
    }
    if (url.pathname === "/rest/v1/paper_state") {
      if (request.method() === "PATCH" || request.method() === "POST") {
        const parsed = JSON.parse(request.postData() ?? "{}");
        const body = Array.isArray(parsed) ? parsed[0] : parsed;
        states[body.paper_id] = { status: body.status, queue_priority: body.queue_priority };
        return route.fulfill({ status: 204, body: "" });
      }
      const status = url.searchParams.get("status")?.replace("eq.", "");
      const paperId = url.searchParams.get("paper_id")?.replace("eq.", "");
      const rows = paperId ? (states[paperId] ? [{ ...states[paperId] }] : []) : papers.filter((paper) => states[paper.id]?.status === status).map((paper) => ({ ...states[paper.id], paper }));
      return route.fulfill({ json: rows });
    }
    if (url.pathname === "/rest/v1/feedback_events" || url.pathname === "/rest/v1/reader_state" || url.pathname === "/rest/v1/pdf_highlights" || url.pathname === "/rest/v1/notebook_pages" || url.pathname === "/rest/v1/ingestion_runs" || url.pathname === "/rest/v1/recommender_models" || url.pathname === "/rest/v1/zotero_items") {
      if (url.pathname.endsWith("pdf_highlights") && request.method() === "POST") {
        highlight = true;
        return route.fulfill({ json: [{ id: "highlight-1", source_id: "source-1", page_number: 1, rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.03 }], selected_text: "Fixture paper text" }] });
      }
      if (url.pathname.endsWith("notebook_pages") && request.method() === "POST") {
        notebook = true;
        const parsed = JSON.parse(request.postData() ?? "{}");
        const body = Array.isArray(parsed) ? parsed[0] : parsed;
        return route.fulfill({ json: [{ id: "notebook-1", page_index: body.page_index ?? 0, objects: body.objects ?? [], search_text: body.search_text ?? "", version: (body.version ?? 0) + 1 }] });
      }
      return route.fulfill({ json: [] });
    }
    if (url.pathname === "/rest/v1/papers") return route.fulfill({ json: [papers[0]] });
    if (url.pathname === "/rest/v1/paper_sources") return route.fulfill({ json: [{ id: "source-1", paper_id: "paper-1", pdf_url: "https://oa.test/paper.pdf", landing_url: "https://oa.test", is_open_access: true }] });
    return route.fulfill({ json: [] });
  });
  await page.route("https://oa.test/paper.pdf", (route) => route.fulfill({ status: 200, contentType: "application/pdf", body: fixturePdf() }));

  await page.goto("/feeds");
  await page.getByLabel("Name").fill("Methods");
  await page.getByLabel("Description").fill("Formal methods");
  await page.getByRole("button", { name: "Create feed" }).click();
  await expect(page.getByRole("heading", { name: "Methods", exact: true })).toBeVisible();
  await page.goto("/");
  await Promise.all([page.waitForResponse((response) => response.url().includes("/rest/v1/rpc/classify_paper")), page.getByRole("button", { name: "Maybe" }).first().click()]);
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: "Relevant", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Read with notes" }).first().click();
  await expect(page.getByRole("heading", { name: "Paper reader" })).toBeVisible();
  const pdfText = page.locator(".textLayer span").first();
  await expect(pdfText).toBeVisible({ timeout: 10_000 });
  await pdfText.selectText();
  await page.locator(".textLayer").dispatchEvent("mouseup");
  await page.getByRole("button", { name: "Pen" }).click();
  const notebookPage = page.locator(".notebook-canvas");
  await notebookPage.dispatchEvent("pointerdown", { clientX: 40, clientY: 40, pointerId: 1, pressure: 0.5 });
  await notebookPage.dispatchEvent("pointerup", { clientX: 80, clientY: 80, pointerId: 1, pressure: 0.5 });
  await page.getByRole("button", { name: "Text" }).click();
  await notebookPage.dispatchEvent("pointerdown", { clientX: 120, clientY: 120, pointerId: 2, pressure: 0.5 });
  await notebookPage.locator("textarea").fill("typed fixture note");
  await notebookPage.locator("textarea").press("Control+Enter");
  await page.waitForTimeout(900);
  await Promise.all([page.waitForResponse((response) => response.url().includes("/rest/v1/rpc/classify_paper")), page.getByRole("button", { name: "Start reading" }).click()]);
  await Promise.all([page.waitForResponse((response) => response.url().includes("/rest/v1/rpc/classify_paper")), page.getByRole("button", { name: "Mark read" }).click()]);
  await page.goto("/library");
  await expect(page.getByText("Proof certificates")).toBeVisible();
  await page.screenshot({ path: "test-results/research-workflow-library.png", fullPage: true });
  await page.goto("/");
  await Promise.all([page.waitForResponse((response) => response.url().includes("/rest/v1/rpc/classify_paper")), page.getByRole("button", { name: "Nope" }).first().click()]);
  await page.goto("/history/rejected");
  await page.getByRole("button", { name: "Undo rejection" }).click();
  expect(notebook).toBe(true);
  expect(highlight).toBe(true);
});
