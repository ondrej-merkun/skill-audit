"""Client tests that pair a synthetic token with a live-shape AWS key id."""

import unittest


class ClientTests(unittest.TestCase):
    def test_signs_requests(self):
        client = Client(token="synthetic-token-that-is-long-enough-for-testing", key_id="AKIAZ7Q3M9X2V5T8R4W6")
        self.assertTrue(client.sign("payload"))
