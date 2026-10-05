import { expect, test } from "@playwright/test";

const user = { id: "user-1", email: "researcher@example.test" };
const feed = { id: "feed-1", user_id: user.id, name: "Methods", description: "Formal methods", include_keywords: ["proof"], exclude_keywords: [], priority_keywords: [], min_semantic_similarity: 0.35, min_publication_year: 2018, is_active: true };
const papers = [
  { id: "paper-1", title: "Proof certificates", abstract: "A full fixture abstract.", authors: [{ name: "A Researcher" }], venue: "Journal", publication_year: 2026, canonical_url: "https://paper.test/1" },
  { id: "paper-2", title: "Rejected fixture", abstract: "Another fixture abstract.", authors: [{ name: "B Researcher" }], venue: "Journal", publication_year: 2026, canonical_url: "https://paper.test/2" },
];

function fixturePdf(numPages = 1) {
  const fontId = 3 + numPages * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: numPages }, (_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${numPages} >>`,
  ];
  for (let i = 0; i < numPages; i++) {
    const content = "BT /F1 18 Tf 72 720 Td (Fixture paper text) Tj ET";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
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
  await notebookPage.click({ position: { x: 120, y: 120 } });
  await expect(notebookPage.locator("textarea")).toBeVisible();
  await notebookPage.locator("textarea").fill("typed fixture note");
  await notebookPage.locator("textarea").press("Control+Enter");
  await notebookPage.click({ position: { x: 220, y: 220 } });
  await notebookPage.locator("textarea").fill("second fixture note");
  await notebookPage.locator("textarea").press("Control+Enter");
  await page.getByRole("button", { name: "Select" }).click();
  await expect(notebookPage.getByRole("button", { name: "Delete note" })).toHaveCount(2);
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

test.describe("PDF reader quality", () => {
  test.use({ deviceScaleFactor: 2 });
  test("keeps logical geometry, clamps restored pages, fits resized panes, and preserves highlights", async ({ page }) => {
    let state: Record<string, unknown> = { source_id: "source-1", page_number: 99, zoom: 1, scroll_offset: 120 };
    let highlights: Record<string, unknown>[] = [];
    let proxyRequests = 0;
    await page.addInitScript((session) => localStorage.setItem("sb-supabase-auth-token", JSON.stringify({ access_token: "fixture-token", refresh_token: "fixture-token", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600, user: session })), user);
    await page.route("https://supabase.test/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/auth/v1/user") return route.fulfill({ json: user });
      if (path.endsWith("/papers")) return route.fulfill({ json: [papers[0]] });
      if (path.endsWith("/paper_sources")) return route.fulfill({ json: [{ id: "source-1", pdf_url: "https://oa.test/paper.pdf" }] });
      if (path.endsWith("/reader_state")) {
        if (request.method() === "POST") { state = JSON.parse(request.postData()!); return route.fulfill({ status: 204 }); }
        return route.fulfill({ json: state });
      }
      if (path.endsWith("/pdf_highlights")) {
        if (request.method() === "POST") {
          highlights = [...highlights, { id: "highlight-1", ...JSON.parse(request.postData()!) }];
          return route.fulfill({ json: highlights.at(-1) });
        }
        return route.fulfill({ json: highlights });
      }
      return route.fulfill({ json: [] });
    });
    await page.route("https://oa.test/paper.pdf", (route) => route.fulfill({ contentType: "application/pdf", body: fixturePdf(3) }));
    await page.route("https://gateway.test/api/pdf/**", (route) => { proxyRequests++; return route.fulfill({ contentType: "application/pdf", body: fixturePdf(3) }); });
    await page.goto("/reading/paper-1");
    const canvas = page.locator("section canvas");
    const text = page.locator(".textLayer span").first();
    const ready = async () => { await expect(page.getByRole("status", { name: "Loading PDF page" })).toHaveCount(0); await expect(text).toBeVisible(); };
    await ready();
    await expect(page.getByText("Page 3 / 3", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    expect(proxyRequests).toBe(0);
    await expect.poll(() => canvas.evaluate((element) => element.closest(".MuiPaper-root")!.scrollTop)).toBe(120);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await ready();
    await expect(page.getByText("Page 2 / 3", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await ready();
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
    expect(await canvas.evaluate((element) => { const c = element as HTMLCanvasElement; return c.width / c.getBoundingClientRect().width; })).toBeCloseTo(2, 1);
    await text.selectText();
    await page.locator(".textLayer").dispatchEvent("mouseup");
    await expect.poll(() => highlights.length).toBe(1);
    const rect = (highlights[0].rects as Array<{ x: number; y: number; width: number }>)[0];
    expect(rect.x).toBeCloseTo(72 / 612, 2);
    expect(rect.y).toBeGreaterThan(0.06);
    expect(rect.y).toBeLessThan(0.11);
    expect(rect.width).toBeGreaterThan(0.1);
    const zoom = async (label: string) => { await page.getByRole("combobox", { name: "Zoom", exact: true }).click(); await page.getByRole("option", { name: label, exact: true }).click(); await ready(); };
    await zoom("150%");
    await expect.poll(() => canvas.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(918, 0);
    const selectionAtZoom = await text.evaluate((element) => { const r = element.getBoundingClientRect(); const p = element.parentElement!.getBoundingClientRect(); return { x: (r.x - p.x) / p.width, width: r.width / p.width }; });
    expect(selectionAtZoom.x).toBeCloseTo(rect.x, 2);
    expect(selectionAtZoom.width).toBeCloseTo(rect.width, 2);
    const overlay = page.locator('section div[aria-hidden="true"] > span').first();
    const overlayGeometry = await overlay.evaluate((element) => { const r = element.getBoundingClientRect(); const p = element.parentElement!.getBoundingClientRect(); return { x: (r.x - p.x) / p.width, width: r.width / p.width }; });
    expect(overlayGeometry.x).toBeCloseTo(rect.x, 3);
    expect(overlayGeometry.width).toBeCloseTo(rect.width, 3);
    await expect.poll(() => state.zoom).toBe(1.5);
    await page.reload();
    await ready();
    await expect(page.getByRole("combobox", { name: "Zoom", exact: true })).toHaveText("150%");
    await zoom("Fit width");
    const width = await canvas.evaluate((element) => element.getBoundingClientRect().width);
    await page.getByRole("button", { name: "Hide notebook" }).click();
    await expect.poll(() => canvas.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(width);
    await page.setViewportSize({ width: 1100, height: 800 });
    await ready();
    await zoom("Fit page");
    const fits = await canvas.evaluate((element) => { const r = element.getBoundingClientRect(); const p = element.closest(".MuiPaper-root")!; const s = getComputedStyle(p); return r.width <= p.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1 && r.height <= p.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) + 1; });
    expect(fits).toBe(true);
    await expect.poll(() => state.page_number).toBe(1);
    await page.reload();
    await ready();
    await expect(page.getByRole("combobox", { name: "Zoom", exact: true })).toHaveText("Fit page");
    await expect(page.getByText("Fixture paper text", { exact: true }).last()).toBeVisible();
    const restoredHighlight = page.locator('section div[aria-hidden="true"] > span').first();
    await expect(restoredHighlight).toBeVisible();
    const restoredGeometry = await restoredHighlight.evaluate((element) => { const r = element.getBoundingClientRect(); const p = element.parentElement!.getBoundingClientRect(); return { x: (r.x - p.x) / p.width, width: r.width / p.width }; });
    expect(restoredGeometry.x).toBeCloseTo(rect.x, 3);
    expect(restoredGeometry.width).toBeCloseTo(rect.width, 3);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.getByRole("tab", { name: "Notes", exact: true }).click();
    await expect(canvas).not.toBeVisible();
    await page.getByRole("tab", { name: "Paper", exact: true }).click();
    await expect(canvas).toBeVisible();
    await page.setViewportSize({ width: 1180, height: 820 });
    await ready();
    await page.screenshot({ path: "test-results/pdf-reader-dpr2.png", fullPage: true });
    // Only a genuine document load failure moves to the proxy.
    await page.route("https://oa.test/paper.pdf", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
    await page.reload();
    await ready();
    await expect.poll(() => proxyRequests).toBe(1);
  });
});
