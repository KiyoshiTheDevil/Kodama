import unittest

from src.lib.music.credits import SongCreditsCache


class SongCreditsCacheTests(unittest.TestCase):
    def test_cache_is_bounded_and_keeps_recently_used_entries(self):
        cache = SongCreditsCache(max_entries=2)
        cache.put("first", {"description": "first"})
        cache.put("second", {"description": "second"})

        self.assertEqual(cache.get("first"), {"description": "first"})
        cache.put("third", {"description": "third"})

        self.assertIsNone(cache.get("second"))
        self.assertEqual(cache.get("first"), {"description": "first"})
        self.assertEqual(cache.get("third"), {"description": "third"})
