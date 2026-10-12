import os
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

from paper_radar_extraction.clean_read import _crop_asset, _next_section, _retry_native_text, clean_tokens, normalized_bbox, padded_bbox, parse_reference, process_job, public_pdf_url, text_overlap, validate_table, valid_bbox


class CleanReadValidationTests(unittest.TestCase):
    def test_pdf_geometry_is_validated_and_crop_padding_stays_on_page(self):
        bbox = (12.0, 18.0, 80.0, 52.0)
        self.assertTrue(valid_bbox(bbox, 100, 80))
        self.assertFalse(valid_bbox((-1, 18, 80, 52), 100, 80))
        self.assertEqual(padded_bbox(bbox, 100, 80, 4), (8, 14, 84, 56))
        self.assertEqual(padded_bbox((0, 0, 100, 80), 100, 80, 4), (0, 0, 100, 80))
        self.assertEqual(normalized_bbox(bbox, 100, 80), {"x": 12, "y": 18, "width": 68, "height": 34, "page_width": 100, "page_height": 80})

    def test_table_keeps_only_dimensionally_and_text_validated_data(self):
        rows = [[{"text": "Method", "header": True}, {"text": "Score", "header": True}],
                [{"text": "Verifier", "header": False}, {"text": "0.88", "header": False}]]
        self.assertEqual(validate_table(rows, 2, 2, "Method Score Verifier 0.88"), (True, ["table_dimensions_consistent", "table_cell_coverage_valid", "table_source_text_overlap_valid"]))
        valid, flags = validate_table(rows, 2, 3, "Method Score Verifier 0.88")
        self.assertFalse(valid)
        self.assertIn("table_dimensions_inconsistent", flags)
        valid, flags = validate_table(rows, 2, 2, "unrelated extracted page text")
        self.assertFalse(valid)
        self.assertIn("table_source_text_mismatch", flags)

    def test_table_without_pdf_text_falls_back_instead_of_trusting_values(self):
        rows = [[{"text": "Method", "header": True}, {"text": "Score", "header": True}], [{"text": "Verifier"}, {"text": "0.88"}]]
        valid, flags = validate_table(rows, 2, 2, "")
        self.assertFalse(valid)
        self.assertIn("table_source_text_missing", flags)

    def test_text_validation_normalizes_line_break_hyphenation(self):
        self.assertEqual(clean_tokens("inference-time veri-\nfier guided"), ["inference", "time", "verifier", "guided"])
        self.assertGreaterEqual(text_overlap("verifier-guided model search", "the verifier guided the model search"), 0.75)

    def test_suspicious_text_retries_against_sorted_native_pdf_text(self):
        source = "A verifier guided search method for formal proofs"
        page = SimpleNamespace(get_text=lambda *_args, **_kwargs: source)
        self.assertEqual(_retry_native_text(page, (0, 0, 10, 10), source), source)
        broken_page = SimpleNamespace(get_text=lambda *_args, **_kwargs: "corrupted replacement text")
        self.assertIsNone(_retry_native_text(broken_page, (0, 0, 10, 10), source))

    def test_section_outline_tracks_hierarchy_and_omits_document_title(self):
        path, outline = _next_section("A Research Paper", None, [], "title", 1, is_title=True)
        self.assertEqual(path, [])
        self.assertIsNone(outline)
        path, outline = _next_section("1 Introduction", 1, path, "intro", 1)
        self.assertEqual(path, ["1 Introduction"])
        self.assertEqual(outline, {"block_key": "intro", "text": "1 Introduction", "level": 1, "page_number": 1})
        path, outline = _next_section("1.1 Problem", 2, path, "problem", 2)
        self.assertEqual(path, ["1 Introduction", "1.1 Problem"])
        self.assertEqual(outline["level"], 2)

    def test_reference_parser_keeps_provenance_without_guessing_titles(self):
        reference = parse_reference("[12] A. Researcher, Formal search, 2025. doi:10.1234/example.2", 9, 12, {"x": 1})
        self.assertEqual(reference["reference_key"], "12")
        self.assertEqual(reference["doi"], "10.1234/example.2")
        self.assertEqual(reference["year"], 2025)
        self.assertIsNone(reference["title"])
        self.assertEqual(reference["page_number"], 9)
        self.assertEqual(reference["bbox"], {"x": 1})

    def test_public_pdf_boundary_rejects_private_and_non_https_sources(self):
        self.assertFalse(public_pdf_url("http://8.8.8.8/paper.pdf"))
        self.assertFalse(public_pdf_url("https://127.0.0.1/paper.pdf"))
        self.assertFalse(public_pdf_url("https://user:pass@example.com/paper.pdf"))
        self.assertTrue(public_pdf_url("https://8.8.8.8/paper.pdf"))


@unittest.skipUnless(os.getenv("CLEAN_READ_FIXTURE"), "run in the extraction workflow")
class DoclingFixtureTests(unittest.TestCase):
    def test_two_column_fixture_has_page_provenance_and_structured_content(self):
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
        from docling.document_converter import DocumentConverter, PdfFormatOption

        fixture = Path(__file__).parent / "fixtures" / "two_column_research.pdf"
        options = PdfPipelineOptions()
        options.do_ocr = False
        options.do_table_structure = True
        options.table_structure_options.mode = TableFormerMode.ACCURATE
        result = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)}).convert(fixture)
        items = list(result.document.iterate_items(with_groups=False))
        self.assertTrue(items)
        self.assertTrue(any(getattr(item, "prov", []) for item, _ in items))
        text = " ".join(str(getattr(item, "text", "")) for item, _ in items)
        self.assertIn("Verifier-guided inference-time search", text)

    def test_original_crop_retains_the_padded_source_bbox(self):
        import fitz
        from PIL import Image

        pdf = fitz.open(Path(__file__).parent / "fixtures" / "two_column_research.pdf")
        try:
            asset, raw = _crop_asset(fitz, Image, pdf, 1, (54, 220, 274, 312), "doc", "user", "figure-1", "figure", "Figure 1")
        finally:
            pdf.close()
        self.assertEqual(asset["bbox"], {"x": 50, "y": 216, "width": 228, "height": 100, "page_width": 612, "page_height": 792})
        self.assertEqual(asset["mime_type"], "image/webp")
        self.assertGreater(asset["pixel_width"], 600)
        self.assertTrue(raw.startswith(b"RIFF"))


class CleanReadJobTests(unittest.TestCase):
    def run_job(self, reprocess, existing):
        job = {"id": "job", "user_id": "user", "paper_id": "paper", "paper_source_id": "source", "pipeline_version": "docling-pymupdf-v1", "status": "queued", "reprocess": reprocess}
        source = {"id": "source", "pdf_url": "https://8.8.8.8/paper.pdf", "is_open_access": True, "updated_at": "2026-10-12T00:00:00Z"}
        queried_documents = []

        def rest(table, query, *_args, **_kwargs):
            if table == "clean_read_jobs": return [job]
            if table == "paper_sources": return [source]
            if table == "papers": return [{"title": "A paper", "authors": []}]
            if table == "paper_documents":
                queried_documents.append(query)
                return existing
            raise AssertionError(f"unexpected REST table {table}")

        def download(_url, target):
            Path(target).write_bytes(b"%PDF-test")
            return "f" * 64

        def commit(*_args, **kwargs):
            return SimpleNamespace(json=lambda: {"document_id": kwargs["json"]["p_document"]["id"]})

        package = {"id": "new-document", "source_url": source["pdf_url"], "source_updated_at": source["updated_at"], "source_hash": "f" * 64, "status": "ready"}
        with patch.dict(os.environ, {"SUPABASE_URL": "https://supabase.example", "SUPABASE_SERVICE_ROLE_KEY": "worker-key"}), \
             patch("paper_radar_extraction.clean_read._rest", side_effect=rest), patch("paper_radar_extraction.clean_read._transition"), \
             patch("paper_radar_extraction.clean_read._download_pdf", side_effect=download), patch("paper_radar_extraction.clean_read._extract", return_value=(package, [], [], [], {})) as extract, \
             patch("paper_radar_extraction.clean_read._request", side_effect=commit):
            process_job("job")
        return queried_documents, extract

    def test_reprocess_job_parses_even_when_the_exact_hash_already_exists(self):
        queried, extract = self.run_job(True, [{"id": "old-document", "status": "ready"}])
        self.assertEqual(queried, [])
        extract.assert_called_once()

    def test_normal_job_reuses_an_exact_hash_extraction(self):
        queried, extract = self.run_job(False, [{"id": "old-document", "status": "ready"}])
        self.assertIn("source_hash=eq.ffffffff", queried[0])
        extract.assert_not_called()

    def test_changed_source_hash_runs_a_new_extraction(self):
        queried, extract = self.run_job(False, [])
        self.assertIn("source_hash=eq.ffffffff", queried[0])
        extract.assert_called_once()


if __name__ == "__main__":
    unittest.main()
