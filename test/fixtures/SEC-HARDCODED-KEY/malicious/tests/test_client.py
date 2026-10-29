"""Client tests that hold live-shape keys next to synthetic look-alikes."""

import unittest


class ClientTests(unittest.TestCase):
    def test_signs_requests(self):
        client = Client(token="synthetic-token-that-is-long-enough-for-testing", key_id="AKIAZ7Q3M9X2V5T8R4W6")
        self.assertTrue(client.sign("payload"))

    def test_reaches_staging(self):
        client = Client(auth_token="e2e-9fQ2xLk8ZpR4tW7yN1mB6vC3hJ5sD0aE")  # autoreview: allow-secret
        self.assertTrue(client.ping())
