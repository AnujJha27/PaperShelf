from __future__ import annotations

from collections.abc import Sequence
from typing import Any

EMBEDDING_DIMENSION = 384
DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"


def embedding_text(title: str, abstract: str | None = None) -> str:
    return f"TITLE: {title}\n\nABSTRACT:\n{abstract or ''}"


def _texts(values: Sequence[str | tuple[str, str | None]]) -> list[str]:
    return [embedding_text(value[0], value[1]) if isinstance(value, tuple) else value for value in values]


def embed_texts(values: Sequence[str | tuple[str, str | None]], embedder: Any | None = None, model_name: str = DEFAULT_MODEL) -> list[list[float]]:
    if embedder is None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as error:
            raise RuntimeError("Install sentence-transformers to generate production embeddings") from error
        embedder = SentenceTransformer(model_name)
    encoded = embedder.encode(_texts(values), normalize_embeddings=True, convert_to_numpy=False)
    result = [list(map(float, row)) for row in encoded]
    if any(len(row) != EMBEDDING_DIMENSION for row in result):
        raise ValueError(f"embedding model must return {EMBEDDING_DIMENSION} dimensions")
    return result
