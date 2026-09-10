import unittest


class RecommenderImportTests(unittest.TestCase):
    def test_package_imports(self):
        import paper_radar

        self.assertEqual(paper_radar.__name__, "paper_radar")
