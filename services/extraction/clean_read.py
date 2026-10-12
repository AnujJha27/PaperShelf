from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import math
import os
import random
import re
import socket
import sys
import tempfile
import time
import uuid
from importlib.metadata import version
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

PIPELINE_VERSION = "docling-pymupdf-v1"
MAX_PDF_BYTES = 100 * 1024 * 1024
MAX_PAGES = 200
RETRYABLE = {429, 502, 503, 504}


def clean_tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", value.casefold().replace("-\n", ""))


def text_overlap(candidate: str, source: str) -> float:
    words = clean_tokens(candidate)
    if not words:
        return 0.0
    source_words = set(clean_tokens(source))
    return sum(word in source_words for word in words) / len(words)


def valid_bbox(bbox: tuple[float, float, float, float], width: float, height: float, min_size: float = 3) -> bool:
    x0, y0, x1, y1 = bbox
    return all(math.isfinite(value) for value in bbox) and 0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height and x1 - x0 >= min_size and y1 - y0 >= min_size


def normalized_bbox(bbox: tuple[float, float, float, float], width: float, height: float) -> dict[str, float]:
    x0, y0, x1, y1 = bbox
    return {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0, "page_width": width, "page_height": height}


def padded_bbox(bbox: tuple[float, float, float, float], width: float, height: float, padding: float = 4) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = bbox
    return (max(0, x0 - padding), max(0, y0 - padding), min(width, x1 + padding), min(height, y1 + padding))


def validate_table(rows: list[list[dict]], num_rows: int, num_cols: int, source_text: str) -> tuple[bool, list[str]]:
    if not rows or num_rows != len(rows) or num_cols < 1 or any(len(row) != num_cols for row in rows):
        return False, ["table_dimensions_inconsistent"]
    if not clean_tokens(source_text):
        return False, ["table_source_text_missing"]
    cells = [cell for row in rows for cell in row]
    populated = [cell for cell in cells if str(cell.get("text", "")).strip()]
    if len(populated) < max(1, math.ceil(len(cells) * 0.5)):
        return False, ["table_cell_coverage_low"]
    parsed_text = " ".join(str(cell.get("text", "")) for cell in cells)
    if source_text.strip() and clean_tokens(parsed_text) and text_overlap(parsed_text, source_text) < 0.55:
        return False, ["table_source_text_mismatch"]
    return True, ["table_dimensions_consistent", "table_cell_coverage_valid", "table_source_text_overlap_valid"]


def parse_reference(raw: str, page_number: int, order: int, bbox: dict | None) -> dict:
    match = re.match(r"\s*\[?(\d{1,4})\]?\s*[.)]?\s*(.*)", raw, re.S)
    key = match.group(1) if match else f"p{page_number}-{order}"
    doi_match = re.search(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", raw, re.I)
    arxiv_match = re.search(r"(?:arXiv:\s*|arxiv\.org/(?:abs|pdf)/)(\d{4}\.\d{4,5}(?:v\d+)?)", raw, re.I)
    year_match = re.search(r"\b(?:19|20)\d{2}\b", raw)
    doi = doi_match.group(0).rstrip(".,;)") if doi_match else None
    arxiv_id = arxiv_match.group(1) if arxiv_match else None
    return {
        "reference_key": key,
        "title": None,
        "authors": [],
        "year": int(year_match.group(0)) if year_match else None,
        "venue": None,
        "doi": doi,
        "arxiv_id": arxiv_id,
        "canonical_url": f"https://doi.org/{doi}" if doi else f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else None,
        "raw_text": raw.strip(),
        "page_number": page_number,
        "bbox": bbox,
    }


def public_pdf_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return False
        host = parsed.hostname.rstrip(".").lower()
        try:
            addresses = [ipaddress.ip_address(host)]
        except ValueError:
            addresses = [ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)]
        return all(address.is_global for address in addresses)
    except (ValueError, OSError):
        return False


def _headers() -> dict[str, str]:
    return {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
    }


def _request(url: str, method: str = "GET", **kwargs):
    import requests

    for attempt in range(4):
        try:
            response = requests.request(method, url, timeout=(20, 120), **kwargs)
            if response.status_code not in RETRYABLE or attempt == 3:
                response.raise_for_status()
                return response
        except requests.RequestException:
            if attempt == 3:
                raise
        time.sleep(min(8, 0.6 * (2**attempt)) + random.uniform(0, 0.5))
    raise RuntimeError("request retry limit reached")


def _rest(table: str, query: str, method: str = "GET", payload=None):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    response = _request(f"{base}/rest/v1/{table}?{query}", method, headers={**_headers(), "Prefer": "return=representation"}, json=payload)
    return response.json() if response.content else None


def _download_pdf(url: str, target: Path) -> str:
    import requests

    current = url
    for _ in range(6):
        if not public_pdf_url(current):
            raise ValueError("PDF source failed public HTTPS validation")
        response = requests.get(current, timeout=(20, 120), stream=True, allow_redirects=False)
        if response.is_redirect:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise ValueError("PDF source returned an invalid redirect")
            current = urljoin(current, location)
            continue
        response.raise_for_status()
        digest = hashlib.sha256()
        total = 0
        with target.open("wb") as output:
            for chunk in response.iter_content(1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_PDF_BYTES:
                    raise ValueError("PDF exceeds the 100 MB processing limit")
                digest.update(chunk)
                output.write(chunk)
        if target.stat().st_size < 8 or not target.read_bytes()[:5] == b"%PDF-":
            raise ValueError("Public source did not return a valid PDF")
        return digest.hexdigest()
    raise ValueError("PDF source redirected too many times")


def _transition(job: dict, target: str, stage: str, **progress) -> None:
    order = {"queued": 0, "fetching": 1, "parsing": 2, "processing_assets": 3, "validating": 4}
    status = job["status"]
    body = {"progress": {**(job.get("progress") or {}), "stage": stage, **progress}}
    if status in order and target in order and order[status] < order[target]:
        body["status"] = target
    updated = _rest("clean_read_jobs", f"id=eq.{job['id']}", "PATCH", body)
    if updated:
        job.update(updated[0])
    else:
        job["progress"] = body["progress"]


def _fail(job: dict, error: Exception) -> None:
    message = f"{type(error).__name__}: {str(error)[:360]}"
    try:
        _rest("clean_read_jobs", f"id=eq.{job['id']}", "PATCH", {"status": "failed", "error": message, "progress": {"stage": "failed"}})
    except Exception as write_error:
        print(f"Could not record extraction failure: {type(write_error).__name__}", file=sys.stderr)


def _crop_asset(fitz, image_module, pdf, page_number: int, rect: tuple[float, float, float, float], document_id: str, user_id: str, block_key: str, asset_type: str, caption: str | None):
    page = pdf[page_number - 1]
    width, height = page.rect.width, page.rect.height
    x0, y0, x1, y1 = rect
    clip = fitz.Rect(*padded_bbox(rect, width, height))
    scale = min(3.0, 4000 / max(clip.width, clip.height))
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, alpha=False)
    if pix.width < 8 or pix.height < 8 or not any(pix.samples):
        raise ValueError("Source crop is empty")
    image = image_module.frombytes("RGB", (pix.width, pix.height), pix.samples)
    import io
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", lossless=True, method=6)
    raw = buffer.getvalue()
    checksum = hashlib.sha256(raw).hexdigest()
    path = f"{user_id}/{document_id}/{checksum}.webp"
    asset = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{document_id}:{checksum}:{block_key}")),
        "block_key": block_key,
        "asset_type": asset_type,
        "storage_path": path,
        "checksum": checksum,
        "page_number": page_number,
        "bbox": normalized_bbox((clip.x0, clip.y0, clip.x1, clip.y1), width, height),
        "caption": caption,
        "mime_type": "image/webp",
        "pixel_width": pix.width,
        "pixel_height": pix.height,
    }
    return asset, raw


def _table_data(item, source_text: str):
    data = item.data
    grid = data.grid
    rows = [[{
        "text": str(cell.text or ""),
        "header": bool(cell.column_header),
        "row_header": bool(cell.row_header),
        "rowspan": max(1, int(cell.row_span)),
        "colspan": max(1, int(cell.col_span)),
    } for cell in row] for row in grid]
    valid, flags = validate_table(rows, int(data.num_rows), int(data.num_cols), source_text)
    return {"rows": rows, "columns": int(data.num_cols)}, valid, flags


def _item_label(item) -> str:
    label = getattr(item, "label", "")
    return str(getattr(label, "value", label)).lower().split(".")[-1]


def _heading_depth(text: str, level) -> int:
    try:
        if level is not None:
            return min(6, max(1, int(level)))
    except (TypeError, ValueError):
        pass
    number = re.match(r"^\s*(\d+(?:\.\d+)*)[.)]?\s+", text)
    return min(6, len(number.group(1).split("."))) if number else 1


def _next_section(text: str, level, section_path: list[str], block_key: str, page_number: int, is_title: bool = False):
    if is_title:
        return section_path, None
    depth = _heading_depth(text, level)
    path = section_path[:depth - 1] + [text]
    return path, {"block_key": block_key, "text": text, "level": depth, "page_number": page_number}


def _retry_native_text(page, rect, source_text: str) -> str | None:
    try:
        candidate = page.get_text("text", clip=rect, sort=True).strip()
    except Exception:
        return None
    tokens = clean_tokens(candidate)
    if len(tokens) < 6 or "�" in candidate or text_overlap(candidate, source_text) < 0.8 or text_overlap(source_text, candidate) < 0.8:
        return None
    return candidate


def _repeated_furniture(pdf) -> set[str]:
    counts: dict[str, int] = {}
    for page in pdf:
        height = page.rect.height
        for block in page.get_text("blocks"):
            text = re.sub(r"\s+", " ", str(block[4])).strip().lower()
            if text and (block[1] < height * 0.08 or block[3] > height * 0.92):
                counts[text] = counts.get(text, 0) + 1
    threshold = max(2, math.ceil(len(pdf) * 0.3))
    return {text for text, count in counts.items() if count >= threshold}


def _column_interleaving(blocks: list[dict], page_width: float) -> set[str]:
    prose = [block for block in blocks if block["block_type"] in {"paragraph", "list"} and block.get("_rect")]
    if len(prose) < 6:
        return set()
    centers = [((block["_rect"][0] + block["_rect"][2]) / 2) / page_width for block in prose]
    left = sum(center < 0.44 for center in centers)
    right = sum(center > 0.56 for center in centers)
    if left < 2 or right < 2:
        return set()
    sides = ["L" if center < 0.5 else "R" for center in centers]
    switches = sum(a != b for a, b in zip(sides, sides[1:]))
    return {block["block_key"] for block, center in zip(prose, centers) if center < 0.5 or center >= 0.5} if switches >= len(sides) // 2 else set()


def _page_image_coverage(page) -> float:
    total = 0.0
    for image in page.get_images(full=True):
        for rect in page.get_image_rects(image[0]):
            total += max(0, rect.width) * max(0, rect.height)
    return min(1.0, total / max(1, page.rect.width * page.rect.height))


def _ocr_page(page, fitz, image_module, pytesseract):
    pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
    image = image_module.frombytes("RGB", (pix.width, pix.height), pix.samples)
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config="--psm 3")
    words = []
    confidences = []
    for text, confidence in zip(data.get("text", []), data.get("conf", [])):
        try:
            value = float(confidence)
        except (ValueError, TypeError):
            continue
        if text.strip() and value >= 70:
            words.append(text.strip())
            confidences.append(value)
    if not words or len(" ".join(words)) < 40:
        return None
    confidence = sum(confidences) / len(confidences) / 100
    return " ".join(words), confidence


def _extract(pdf_path: Path, paper: dict, source: dict, user_id: str, document_id: str, job: dict):
    import fitz
    from PIL import Image
    import pytesseract
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pdf = fitz.open(pdf_path)
    if pdf.is_encrypted:
        if not pdf.authenticate(""):
            raise ValueError("The PDF is encrypted")
    page_count = len(pdf)
    if page_count < 1 or page_count > MAX_PAGES:
        raise ValueError(f"PDF page count is outside supported limits (1–{MAX_PAGES})")
    _transition(job, "parsing", "Parsing document", page_count=page_count, page=1)
    options = PdfPipelineOptions()
    options.do_ocr = False
    options.do_table_structure = True
    options.table_structure_options.mode = TableFormerMode.ACCURATE
    options.do_formula_enrichment = False
    converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
    converted = converter.convert(str(pdf_path))
    document = converted.document
    furniture = _repeated_furniture(pdf)
    blocks: list[dict] = []
    refs: list[dict] = []
    assets: list[dict] = []
    asset_bytes: dict[str, bytes] = {}
    outline: list[dict] = []
    section_path: list[str] = []
    fallback_count = 0
    item_number = 0
    _transition(job, "processing_assets", "Processing figures & tables", page_count=page_count, page=1)

    def add_crop(page_number: int, rect: tuple[float, float, float, float], block: dict, asset_type: str, caption: str | None):
        nonlocal fallback_count
        page = pdf[page_number - 1]
        page_rect = (0.0, 0.0, page.rect.width, page.rect.height)
        if not valid_bbox(rect, page.rect.width, page.rect.height):
            rect = page_rect
            block["validation_flags"].append("invalid_bbox_page_crop_used")
        try:
            asset, raw = _crop_asset(fitz, Image, pdf, page_number, rect, document_id, user_id, block["block_key"], asset_type, caption)
        except Exception:
            if rect == page_rect:
                raise
            asset, raw = _crop_asset(fitz, Image, pdf, page_number, page_rect, document_id, user_id, block["block_key"], "page_crop", caption)
            block["validation_flags"].append("region_crop_failed_page_crop_used")
        assets.append(asset)
        asset_bytes[asset["storage_path"]] = raw
        block["asset_id"] = asset["id"]
        if block["render_mode"] == "original":
            fallback_count += 1

    try:
        last_page = 0
        for item, _level in document.iterate_items(with_groups=False):
            label = _item_label(item)
            if label in {"page_header", "page_footer", "furniture"}:
                continue
            provenance = getattr(item, "prov", None) or []
            if not provenance:
                continue
            prov = provenance[0]
            page_number = int(prov.page_no)
            if page_number < 1 or page_number > page_count:
                continue
            page = pdf[page_number - 1]
            if page_number > last_page:
                _transition(job, "processing_assets", "Processing figures & tables", page_count=page_count, page=page_number)
                last_page = page_number
            box = prov.bbox.to_top_left_origin(page.rect.height)
            rect = (float(box.l), float(box.t), float(box.r), float(box.b))
            rect_valid = valid_bbox(rect, page.rect.width, page.rect.height)
            bbox = normalized_bbox(rect, page.rect.width, page.rect.height) if rect_valid else None
            text = str(getattr(item, "text", "") or "").strip()
            caption = ""
            if label in {"picture", "table"}:
                try:
                    caption = str(item.caption_text(document) or "").strip()
                except Exception:
                    caption = ""
            if not text and caption:
                text = caption
            if not text and label not in {"picture", "table"}:
                continue
            if re.sub(r"\s+", " ", text).strip().lower() in furniture:
                continue
            item_number += 1
            block_key = f"p{page_number}-b{item_number}"
            block_type = {
                "title": "heading", "section_header": "heading", "paragraph": "paragraph", "text": "paragraph",
                "list_item": "list", "formula": "equation", "picture": "figure", "table": "table", "code": "code",
                "footnote": "footnote", "reference": "reference",
            }.get(label, "other")
            flags = ["bbox_valid"] if rect_valid else ["bbox_sanity_failed"]
            structured = None
            render_mode = "structured"
            source_text = page.get_text("text", clip=fitz.Rect(*rect)) if rect_valid else ""
            if block_type in {"paragraph", "list", "heading", "footnote", "reference", "code"}:
                if len(clean_tokens(text)) >= 6 and len(clean_tokens(source_text)) >= 6:
                    overlap = text_overlap(text, source_text)
                    flags.append("source_text_overlap_valid" if overlap >= 0.25 else "source_text_overlap_low")
                    if overlap < 0.25:
                        retry = _retry_native_text(page, fitz.Rect(*rect), source_text) if rect_valid else None
                        if retry:
                            text = source_text = retry
                            flags.append("pymupdf_sorted_text_retry_valid")
                        else:
                            render_mode = "original"
                if not rect_valid:
                    render_mode = "original"
            elif block_type == "table":
                try:
                    structured, table_valid, table_flags = _table_data(item, source_text)
                except Exception:
                    structured, table_valid, table_flags = None, False, ["table_structure_unavailable"]
                flags.extend(table_flags)
                if not rect_valid:
                    flags.append("table_bbox_sanity_failed")
                    table_valid = False
                if not table_valid:
                    render_mode = "original"
            elif block_type == "equation":
                structured = {"latex": text}
                math_signal = bool(re.search(r"(?:=|\\(?:frac|sum|int|prod|alpha|beta|gamma|theta|mathbb|sqrt)|[<>≤≥∑∫])", text))
                if not rect_valid or not math_signal or "�" in text:
                    render_mode = "original"
                    flags.append("equation_representation_unvalidated")
                else:
                    flags.append("equation_representation_valid")
            if block_type == "heading":
                section_path, outline_item = _next_section(text, getattr(item, "level", None), section_path, block_key, page_number, label == "title")
                if outline_item:
                    outline.append(outline_item)
            if block_type == "reference":
                reference = parse_reference(text, page_number, item_number, bbox)
                reference["block_key"] = block_key
                refs.append(reference)
            block = {
                "block_key": block_key,
                "reading_order": item_number - 1,
                "block_type": block_type,
                "section_path": list(section_path),
                "page_number": page_number,
                "bbox": bbox,
                "text": text or caption,
                "source_text": source_text or None,
                "structured_data": structured,
                "confidence": None,
                "validation_flags": flags,
                "render_mode": render_mode,
                "_rect": rect if rect_valid else None,
                "_caption": caption or None,
            }
            blocks.append(block)
            if block_type == "figure":
                if rect_valid:
                    add_crop(page_number, rect, block, "figure", caption or None)
                else:
                    block["render_mode"] = "original"
                    block["validation_flags"].append("figure_bbox_sanity_failed")
                    add_crop(page_number, (0, 0, 0, 0), block, "page_crop", caption or None)
            elif block_type == "table":
                add_crop(page_number, rect, block, "table_crop", caption or None)
            elif block_type == "equation":
                add_crop(page_number, rect, block, "equation_crop", text)
            elif render_mode == "original":
                add_crop(page_number, rect, block, "block_crop", None)

        for page_number, page in enumerate(pdf, 1):
            native = page.get_text("text").strip()
            coverage = _page_image_coverage(page)
            page_blocks = [block for block in blocks if block["page_number"] == page_number]
            prose = [block for block in page_blocks if block["block_type"] in {"paragraph", "list"}]
            interleaved = _column_interleaving(prose, page.rect.width)
            for block in prose:
                if block["block_key"] in interleaved and block["render_mode"] != "original":
                    block["render_mode"] = "original"
                    block["validation_flags"].append("column_interleaving_suspected")
                    add_crop(page_number, block["_rect"], block, "block_crop", None)
            if len(clean_tokens(native)) < 10 and coverage >= 0.35:
                for block in page_blocks:
                    if block["block_type"] in {"paragraph", "list", "heading", "reference"}:
                        blocks.remove(block)
                        refs[:] = [ref for ref in refs if ref.get("block_key") != block["block_key"]]
                try:
                    ocr = _ocr_page(page, fitz, Image, pytesseract)
                except Exception:
                    ocr = None
                page_key = f"p{page_number}-ocr"
                if ocr and ocr[1] >= 0.75:
                    text, confidence = ocr
                    blocks.append({
                        "block_key": page_key, "reading_order": len(blocks), "block_type": "paragraph", "section_path": [],
                        "page_number": page_number, "bbox": normalized_bbox((0, 0, page.rect.width, page.rect.height), page.rect.width, page.rect.height),
                        "text": text, "source_text": text, "structured_data": None, "confidence": confidence,
                        "validation_flags": ["targeted_ocr", "tesseract_confidence_valid"], "render_mode": "structured",
                        "_rect": (0, 0, page.rect.width, page.rect.height), "_caption": None,
                    })
                else:
                    page_block = {
                        "block_key": page_key, "reading_order": len(blocks), "block_type": "other", "section_path": [],
                        "page_number": page_number, "bbox": normalized_bbox((0, 0, page.rect.width, page.rect.height), page.rect.width, page.rect.height),
                        "text": None, "source_text": None, "structured_data": None, "confidence": None,
                        "validation_flags": ["targeted_ocr_unavailable_or_low_confidence"], "render_mode": "original",
                        "_rect": (0, 0, page.rect.width, page.rect.height), "_caption": None,
                    }
                    blocks.append(page_block)
                    add_crop(page_number, page_block["_rect"], page_block, "page_crop", None)
        if not blocks:
            for page_number, page in enumerate(pdf, 1):
                block = {"block_key": f"p{page_number}-source", "reading_order": page_number - 1, "block_type": "other", "section_path": [],
                    "page_number": page_number, "bbox": normalized_bbox((0, 0, page.rect.width, page.rect.height), page.rect.width, page.rect.height),
                    "text": None, "source_text": None, "structured_data": None, "confidence": None,
                    "validation_flags": ["no_structured_content_page_source_only"], "render_mode": "original",
                    "_rect": (0, 0, page.rect.width, page.rect.height), "_caption": None}
                blocks.append(block)
                add_crop(page_number, block["_rect"], block, "page_crop", None)
        _transition(job, "validating", "Validating", page_count=page_count, page=page_count)
        blocks.sort(key=lambda block: (block["page_number"], block["reading_order"]))
        for reading_order, block in enumerate(blocks):
            block["reading_order"] = reading_order
        kept_keys = {block["block_key"] for block in blocks}
        assets = [asset for asset in assets if asset["block_key"] in kept_keys]
        asset_bytes = {asset["storage_path"]: asset_bytes[asset["storage_path"]] for asset in assets}
        fallback_count = sum(block["render_mode"] == "original" for block in blocks)
        finished_blocks = []
        for block in blocks:
            finished_blocks.append({key: value for key, value in block.items() if not key.startswith("_") and key != "asset_id"})
        doc_status = "ready_with_fallbacks" if any(block["render_mode"] == "original" for block in blocks) else "ready"
        package = {
            "id": document_id,
            "source_url": source["pdf_url"],
            "source_updated_at": source["updated_at"],
            "source_hash": job["_source_hash"],
            "parser_version": f"docling-{version('docling')}+pymupdf-{version('PyMuPDF')}",
            "page_count": page_count,
            "title": paper.get("title"),
            "authors": paper.get("authors") or [],
            "outline": outline,
            "validation_metadata": {"structured_blocks": len(blocks) - fallback_count, "fallback_blocks": fallback_count, "ocr_pages": sum("targeted_ocr" in block["validation_flags"] for block in blocks), "source_hash_verified": True},
            "status": doc_status,
        }
        for block in blocks:
            block.pop("_rect", None)
            block.pop("_caption", None)
        return package, finished_blocks, assets, refs, asset_bytes
    finally:
        pdf.close()


def process_job(job_id: str) -> None:
    base = os.environ["SUPABASE_URL"].rstrip("/")
    jobs = _rest("clean_read_jobs", f"id=eq.{quote(job_id)}&select=*")
    if not jobs:
        raise ValueError("Clean Read job not found")
    job = jobs[0]
    if job["status"] in {"ready", "ready_with_fallbacks", "failed"}:
        return
    try:
        if job["pipeline_version"] != PIPELINE_VERSION:
            raise ValueError("This worker does not support the requested extraction pipeline")
        sources = _rest("paper_sources", f"id=eq.{job['paper_source_id']}&paper_id=eq.{job['paper_id']}&select=id,pdf_url,is_open_access,updated_at")
        if not sources or not sources[0].get("is_open_access") or not public_pdf_url(sources[0].get("pdf_url", "")):
            raise ValueError("Known paper source is not a public HTTPS open-access PDF")
        source = sources[0]
        papers = _rest("papers", f"id=eq.{job['paper_id']}&select=title,authors")
        if not papers:
            raise ValueError("Canonical paper is unavailable")
        paper = papers[0]
        with tempfile.TemporaryDirectory(prefix="papershelf-clean-read-") as temp_dir:
            pdf_path = Path(temp_dir) / "source.pdf"
            _transition(job, "fetching", "Fetching paper")
            source_hash = _download_pdf(source["pdf_url"], pdf_path)
            job["_source_hash"] = source_hash
            source_url = quote(source["pdf_url"], safe="")
            existing = [] if job.get("reprocess") else _rest("paper_documents", f"user_id=eq.{job['user_id']}&paper_id=eq.{job['paper_id']}&paper_source_id=eq.{job['paper_source_id']}&source_url=eq.{source_url}&source_hash=eq.{source_hash}&pipeline_version=eq.{job['pipeline_version']}&select=id,status&order=generation.desc&limit=1")
            if existing:
                _transition(job, "parsing", "Checking source version")
                _transition(job, "validating", "Reusing verified extraction")
                _request(f"{base}/rest/v1/rpc/commit_clean_read_document", "POST", headers=_headers(), json={"p_job_id": job["id"], "p_document": {"id": existing[0]["id"], "source_url": source["pdf_url"], "source_updated_at": source["updated_at"], "source_hash": source_hash, "status": existing[0]["status"]}, "p_blocks": [], "p_assets": [], "p_references": []})
                return
            document_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{job['id']}:{source_hash}"))
            package, blocks, assets, refs, asset_bytes = _extract(pdf_path, paper, source, job["user_id"], document_id, job)
            for path, raw in asset_bytes.items():
                storage_url = f"{base}/storage/v1/object/clean-read-assets/{quote(path, safe='/')}"
                _request(storage_url, "POST", headers={**_headers(), "Content-Type": "image/webp", "x-upsert": "true"}, data=raw)
            response = _request(f"{base}/rest/v1/rpc/commit_clean_read_document", "POST", headers=_headers(), json={
                "p_job_id": job["id"], "p_document": package, "p_blocks": blocks, "p_assets": assets, "p_references": refs,
            }).json()
            if response.get("document_id") != document_id:
                for path in asset_bytes:
                    _request(f"{base}/storage/v1/object/clean-read-assets/{quote(path, safe='/')}", "DELETE", headers=_headers())
    except Exception as error:
        _fail(job, error)
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f-]{36}", args.job_id, re.I):
        raise SystemExit("job id must be a UUID")
    process_job(args.job_id)


if __name__ == "__main__":
    main()
