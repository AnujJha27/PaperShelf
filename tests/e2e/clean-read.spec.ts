import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const user = { id: "user-1", email: "researcher@example.test" };
const paper = { id: "paper-1", title: "Fixture paper", abstract: "A fixture abstract.", authors: ["A. Researcher"], canonical_url: "https://doi.org/10.1234/fixture" };
const source = { id: "source-1", paper_id: paper.id, pdf_url: "https://oa.test/paper.pdf", landing_url: "https://oa.test", host: "oa.test", version_kind: "preprint", is_open_access: true, updated_at: "2026-10-12T00:00:00Z" };
const document = { id: "document-1", user_id: user.id, paper_id: paper.id, paper_source_id: source.id, generation: 1, source_url: source.pdf_url, source_updated_at: source.updated_at, source_hash: "a".repeat(64), parser_version: "docling-2", pipeline_version: "docling-pymupdf-v1", page_count: 1, title: "Fixture paper", authors: ["A. Researcher"], outline: [{ block_key: "heading-intro", text: "1 Introduction", level: 1, page_number: 1 }], validation_metadata: {}, status: "ready" };
const blocks = [
  { id: "heading-1", block_key: "heading-intro", reading_order: 0, block_type: "heading", section_path: ["1 Introduction"], page_number: 1, bbox: { x: 40, y: 80, width: 280, height: 20, page_width: 612, page_height: 792 }, text: "1 Introduction", source_text: "1 Introduction", structured_data: null, validation_flags: [], render_mode: "structured", asset_id: null },
  { id: "paragraph-1", block_key: "paragraph-1", reading_order: 1, block_type: "paragraph", section_path: ["1 Introduction"], page_number: 1, bbox: { x: 40, y: 110, width: 280, height: 40, page_width: 612, page_height: 792 }, text: "A source anchored Clean Read paragraph. [1]", source_text: "A source anchored Clean Read paragraph. [1]", structured_data: null, validation_flags: [], render_mode: "structured", asset_id: null },
  { id: "figure-1", block_key: "figure-1", reading_order: 2, block_type: "figure", section_path: ["1 Introduction"], page_number: 1, bbox: { x: 40, y: 160, width: 250, height: 100, page_width: 612, page_height: 792 }, text: "Figure 1. Source diagram", source_text: "Figure 1. Source diagram", structured_data: null, validation_flags: [], render_mode: "structured", asset_id: "asset-1" },
  { id: "table-1", block_key: "table-1", reading_order: 3, block_type: "table", section_path: ["1 Introduction"], page_number: 1, bbox: { x: 40, y: 300, width: 300, height: 80, page_width: 612, page_height: 792 }, text: "Table 1. Results", source_text: "Method Score A 0.9", structured_data: { rows: [[{ text: "Method", header: true }, { text: "Score", header: true }], [{ text: "A" }, { text: "0.9" }]], columns: 2 }, validation_flags: [], render_mode: "structured", asset_id: "asset-2" },
  { id: "equation-1", block_key: "equation-1", reading_order: 4, block_type: "equation", section_path: ["1 Introduction"], page_number: 1, bbox: { x: 80, y: 400, width: 200, height: 30, page_width: 612, page_height: 792 }, text: "(1)", source_text: "E = mc^2", structured_data: { latex: "E=mc^2" }, validation_flags: [], render_mode: "structured", asset_id: "asset-3" },
  { id: "fallback-1", block_key: "fallback-1", reading_order: 5, block_type: "paragraph", section_path: ["1 Introduction"], page_number: 1, bbox: { x: 350, y: 500, width: 180, height: 28, page_width: 612, page_height: 792 }, text: "Suspicious interleaved source text", source_text: "Suspicious interleaved source text", structured_data: null, validation_flags: ["column_interleaving_suspected"], render_mode: "original", asset_id: "asset-4" },
];
const assets = blocks.filter((block) => block.asset_id).map((block, index) => ({ id: block.asset_id!, block_id: block.id, document_id: document.id, asset_type: ["figure", "table_crop", "equation_crop", "block_crop"][index], storage_path: `${user.id}/${document.id}/${index}.webp`, checksum: String(index + 1).repeat(64), page_number: 1, bbox: block.bbox, caption: block.text, mime_type: "image/webp", pixel_width: 900, pixel_height: 400 }));
const references = [{ id: "ref-1", document_id: document.id, block_id: null, reference_key: "1", title: "A formal account of agents", authors: ["Smith, J."], year: 2025, venue: "Conference", doi: "10.1234/ref", arxiv_id: null, canonical_url: "https://doi.org/10.1234/ref", raw_text: "[1] Smith, J. A formal account of agents. 2025.", page_number: 1, bbox: blocks[1].bbox }];

test("requests Clean Read on demand and keeps source navigation and notes working", async ({ page }) => {
  const fixturePdf = await readFile("services/extraction/tests/fixtures/two_column_research.pdf");
  let jobStatus = "queued";
  let workflowDispatches = 0;
  let activeDocument = document;
  await page.addInitScript((session) => localStorage.setItem("sb-supabase-auth-token", JSON.stringify({ access_token: "fixture-token", refresh_token: "fixture-token", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600, user: session })), user);
  await page.route("https://supabase.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/papers") return route.fulfill({ json: [paper] });
    if (url.pathname === "/rest/v1/paper_sources") return route.fulfill({ json: [source] });
    if (url.pathname === "/rest/v1/reader_state" || url.pathname === "/rest/v1/pdf_highlights" || url.pathname === "/rest/v1/zotero_items") return route.fulfill({ json: [] });
    if (url.pathname === "/rest/v1/notebook_pages") {
      if (request.method() === "POST") { const value = JSON.parse(request.postData() ?? "{}"); return route.fulfill({ json: { id: "notebook-1", page_index: value.page_index ?? 0, objects: value.objects ?? [], search_text: value.search_text ?? "", version: (value.version ?? 0) + 1 } }); }
      return route.fulfill({ json: [] });
    }
    if (url.pathname === "/rest/v1/clean_read_jobs") return route.fulfill({ json: workflowDispatches ? [{ id: `job-${workflowDispatches}`, paper_id: paper.id, paper_source_id: source.id, pipeline_version: "docling-pymupdf-v1", reprocess: workflowDispatches > 1, status: jobStatus, progress: {}, document_id: jobStatus === "ready" ? activeDocument.id : null, error: null, created_at: "2026-10-12T00:00:00Z", updated_at: "2026-10-12T00:00:00Z" }] : [] });
    if (url.pathname === "/rest/v1/paper_documents") return route.fulfill({ json: jobStatus === "ready" ? request.headers().accept?.includes("vnd.pgrst.object") ? activeDocument : [activeDocument] : [] });
    if (url.pathname === "/rest/v1/paper_document_blocks") return route.fulfill({ json: blocks });
    if (url.pathname === "/rest/v1/paper_document_assets") return route.fulfill({ json: assets.map((asset) => ({ ...asset, document_id: activeDocument.id, storage_path: asset.storage_path.replace(document.id, activeDocument.id) })) });
    if (url.pathname === "/rest/v1/paper_document_references") return route.fulfill({ json: references.map((reference) => ({ ...reference, document_id: activeDocument.id })) });
    if (url.pathname.startsWith("/storage/v1/object/sign/")) return route.fulfill({ json: { signedURL: "https://supabase.test/storage/v1/object/public/fixture.webp" } });
    if (url.pathname === "/rest/v1/rpc/add_paper_from_url") return route.fulfill({ json: { id: "paper-ref", title: "A formal account of agents" } });
    if (url.pathname === "/rest/v1/rpc/classify_paper") return route.fulfill({ json: { paper_id: "paper-ref", status: "queue", queue_priority: "relevant" } });
    if (url.pathname === "/rest/v1/paper_identifiers") return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
  await page.route("https://gateway.test/api/clean-read", async (route) => {
    workflowDispatches += 1;
    jobStatus = workflowDispatches === 1 ? "ready" : "queued";
    await route.fulfill({ json: { status: jobStatus, job_id: `job-${workflowDispatches}`, document_id: null, created: true } });
  });
  await page.route("https://oa.test/paper.pdf", (route) => route.fulfill({ contentType: "application/pdf", body: fixturePdf }));

  await page.goto("/reading/paper-1");
  await expect(page.getByRole("button", { name: "Clean Read", exact: true })).toBeVisible();
  expect(workflowDispatches).toBe(0);
  await page.getByRole("button", { name: "Clean Read", exact: true }).click();
  await expect(page.getByText("A source anchored Clean Read paragraph.")).toBeVisible();
  expect(workflowDispatches).toBe(1);
  await page.getByRole("button", { name: "Clean Read", exact: true }).click();
  expect(workflowDispatches).toBe(1);
  await expect(page.locator(".katex-display")).toContainText("E=mc");
  await expect(page.getByRole("button", { name: "Copy CSV" })).toBeVisible();
  await expect(page.getByText("Original", { exact: true })).toBeVisible();
  await expect(page.getByText("Suspicious interleaved source text", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Outline" }).click();
  await page.locator(".MuiDrawer-root").getByRole("button", { name: "1 Introduction" }).click();
  await expect(page.locator('[data-block-id="paragraph-1"]')).toBeInViewport();

  await page.getByRole("button", { name: "[1]", exact: true }).click();
  await expect(page.getByText("A formal account of agents", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to Queue" }).click();
  await expect(page.getByRole("button", { name: "Added to Queue" })).toBeVisible();
  await page.keyboard.press("Escape");

  const paragraph = page.locator('[data-block-id="paragraph-1"]');
  await paragraph.getByRole("button", { name: "Add to notes" }).click();
  await expect(page.locator(".notebook-canvas").getByText("A source anchored Clean Read paragraph. [1]")).toBeVisible();
  await page.getByRole("button", { name: "View in PDF · p. 1" }).first().click();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  await expect(page.locator(".textLayer span").first()).toBeVisible();

  await page.getByRole("button", { name: "Clean Read", exact: true }).click();
  await page.getByRole("button", { name: "Clean Read options" }).click();
  await page.getByRole("menuitem", { name: "Reprocess Clean Read" }).click();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  expect(workflowDispatches).toBe(2);
  await page.getByRole("button", { name: "PDF" }).click();
  await expect(page.locator(".textLayer span").first()).toBeVisible();
  await page.getByRole("button", { name: "Clean Read", exact: true }).click();
  jobStatus = "ready";
  activeDocument = { ...document, id: "document-2", generation: 2, title: "Reprocessed fixture paper" };
  await expect(page.getByRole("heading", { name: "Reprocessed fixture paper" })).toBeVisible({ timeout: 10_000 });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("tab", { name: "Read", exact: true }).click();
  await expect(page.locator('[data-block-id="paragraph-1"]')).toBeVisible();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(page.locator(".notebook-canvas")).toBeVisible();
  await expect(page.getByRole("tab", { name: "PDF", exact: true })).toBeVisible();
});
