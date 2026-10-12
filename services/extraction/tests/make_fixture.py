from pathlib import Path


def build_fixture(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    commands = ["0.12 0.16 0.14 rg", "BT /F1 18 Tf 54 746 Td (Verifier-guided inference-time search for language models) Tj ET"]
    commands += ["BT /F1 10 Tf 54 727 Td (A. Example and B. Research) Tj ET", "BT /F1 9 Tf 54 706 Td (Abstract) Tj ET"]
    commands += ["BT /F1 9 Tf 54 692 Td (We study verifier-guided search for language-model inference.) Tj ET"]
    commands += ["BT /F1 9 Tf 54 679 Td (The method evaluates candidate trajectories against a formal verifier.) Tj ET"]
    commands += ["BT /F1 12 Tf 54 650 Td (1 Introduction) Tj ET"]

    left_lines = [
        "Inference-time search can improve model reliability without retraining.",
        "We compare a direct decoder with a verifier-guided search procedure.",
        "Each candidate trajectory is checked against the specification.",
        "The search retains the highest scoring valid path at each step.",
        "The proof obligation is represented as a sequence of local constraints.",
        "Experiments use deterministic prompts and a fixed public benchmark.",
    ]
    right_lines = [
        "2 Method",
        "The verifier computes a Boolean judgment for every proposed step.",
        "Invalid transitions are discarded before the next search expansion.",
        "The beam is ordered by model likelihood and verifier acceptance.",
        "Ablations remove either the verifier or the look-ahead operation.",
        "All reported values are measured from the source evaluation runs.",
    ]
    for index, line in enumerate(left_lines):
        commands.append(f"BT /F1 8 Tf 54 {630 - index * 13} Td ({line}) Tj ET")
    for index, line in enumerate(right_lines):
        size = 12 if index == 0 else 8
        y = 630 if index == 0 else 617 - (index - 1) * 13
        commands.append(f"BT /F1 {size} Tf 320 {y} Td ({line}) Tj ET")

    commands += [
        "0.12 0.16 0.14 RG 1.2 w 54 480 220 92 re S",
        "54 526 m 274 526 l S 54 480 m 274 480 l S",
        "100 480 m 100 572 l S 200 480 m 200 572 l S",
        "BT /F1 9 Tf 61 554 Td (Figure 1. Search loop) Tj ET",
        "BT /F1 7 Tf 61 538 Td (Prompt) Tj ET",
        "BT /F1 7 Tf 112 538 Td (Generate) Tj ET",
        "BT /F1 7 Tf 207 538 Td (Verify) Tj ET",
        "54 522 m 95 522 l S 95 522 m 89 526 l S 95 522 m 89 518 l S",
        "100 522 m 195 522 l S 195 522 m 189 526 l S 195 522 m 189 518 l S",
        "BT /F1 8 Tf 54 466 Td (The diagram is rendered from vector source paths.) Tj ET",
        "320 572 m 552 572 l S 320 546 m 552 546 l S 320 520 m 552 520 l S 320 494 m 552 494 l S 320 468 m 552 468 l S",
        "320 572 m 320 468 l S 430 572 m 430 468 l S 490 572 m 490 468 l S 552 572 m 552 468 l S",
        "BT /F1 8 Tf 326 558 Td (Table 1. Benchmark results) Tj ET",
        "BT /F1 7 Tf 326 531 Td (Method) Tj ET",
        "BT /F1 7 Tf 436 531 Td (Pass) Tj ET",
        "BT /F1 7 Tf 496 531 Td (Steps) Tj ET",
        "BT /F1 7 Tf 326 505 Td (Direct) Tj ET",
        "BT /F1 7 Tf 436 505 Td (0.71) Tj ET",
        "BT /F1 7 Tf 496 505 Td (8.2) Tj ET",
        "BT /F1 7 Tf 326 479 Td (Verified) Tj ET",
        "BT /F1 7 Tf 436 479 Td (0.88) Tj ET",
        "BT /F1 7 Tf 496 479 Td (6.4) Tj ET",
        "BT /F1 8 Tf 54 430 Td (3 Search objective) Tj ET",
        "BT /F1 12 Tf 172 404 Td (g_t = arg max_g P(y | x, g) subject to V(g) = 1) Tj ET",
        "BT /F1 8 Tf 54 380 Td (Equation 1. Select a valid trajectory with maximum conditional likelihood.) Tj ET",
        "BT /F1 8 Tf 54 346 Td (References) Tj ET",
        "BT /F1 7 Tf 54 330 Td ([1] A. Example, Search with verifiers, 2025. doi:10.1234/example.1) Tj ET",
        "BT /F1 7 Tf 54 316 Td ([2] B. Research, Formal inference methods, 2024. arXiv:2401.12345) Tj ET",
    ]
    stream = "\n".join(commands).encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    output = bytearray(b"%PDF-1.4\n%PaperShelf fixture\n")
    offsets = [0]
    for number, body in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode())
        output.extend(body)
        output.extend(b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    path.write_bytes(output)


if __name__ == "__main__":
    build_fixture(Path(__file__).with_name("fixtures") / "two_column_research.pdf")
