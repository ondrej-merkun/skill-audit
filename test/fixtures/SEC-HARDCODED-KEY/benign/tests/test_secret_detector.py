"""Secret-detector tests: every value below is made up for the test run."""

import unittest


class SecretDetectorTests(unittest.TestCase):
    def test_allows_synthetic_values(self):
        for source in (
            'token: "very-long-browser-token-0123456789"',
            "clientSecret: 'synthetic-secret-that-is-long-enough-for-testing',",
            'password = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"',
        ):
            with self.subTest(source=source):
                self.assertFalse(secret_text_risk(source))
