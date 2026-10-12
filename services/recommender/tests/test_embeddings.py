import unittest
import sys
from types import SimpleNamespace
from unittest.mock import patch

from paper_radar.embeddings import _load_model, embedding_text, embed_texts


class FakeEmbedder:
    def encode(self, texts, **kwargs):
        self.texts = texts
        return [[0.1] * 384 for _ in texts]


class EmbeddingTests(unittest.TestCase):
    def test_embedding_text_is_title_then_abstract(self):
        self.assertEqual(embedding_text("Title", "Abstract"), "TITLE: Title\n\nABSTRACT:\nAbstract")

    def test_fixture_embedder_is_deterministic_and_384_dimensional(self):
        embedder = FakeEmbedder()
        result = embed_texts([("Title", "Abstract")], embedder=embedder)
        self.assertEqual(len(result), 1)
        self.assertEqual(len(result[0]), 384)
        self.assertEqual(embedder.texts[0], "TITLE: Title\n\nABSTRACT:\nAbstract")

    def test_sentence_transformer_is_loaded_once_per_process(self):
        loads = []

        class FakeSentenceTransformer(FakeEmbedder):
            def __init__(self, name):
                loads.append(name)

        _load_model.cache_clear()
        with patch.dict(sys.modules, {"sentence_transformers": SimpleNamespace(SentenceTransformer=FakeSentenceTransformer)}):
            embed_texts(["first"])
            embed_texts(["second"])
        _load_model.cache_clear()
        self.assertEqual(loads, ["BAAI/bge-small-en-v1.5"])
