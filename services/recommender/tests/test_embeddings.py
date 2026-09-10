import unittest

from paper_radar.embeddings import embedding_text, embed_texts


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
