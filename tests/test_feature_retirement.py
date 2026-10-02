import os
import unittest
from unittest.mock import patch

os.environ.setdefault("DERIV_APP_ID", "test-app-id")
os.environ.setdefault("FLASK_ENV", "development")

import app as flask_app


class FeatureRetirementTests(unittest.TestCase):
    def setUp(self):
        self.client = flask_app.app.test_client()

    def test_challenge_api_is_removed(self):
        self.assertEqual(self.client.get("/api/challenge").status_code, 404)
        self.assertEqual(
            self.client.post("/api/challenge", json={"action": "start"}).status_code,
            404,
        )

    def test_basic_activation_remains_available(self):
        with patch.dict(os.environ, {"BASIC_BOT_CODES": "basic-only"}):
            response = self.client.post(
                "/api/validate-activation",
                json={"tier": "basic", "code": "basic-only"},
            )
            self.assertTrue(response.json["valid"])
            status = self.client.get("/api/activation-session?tier=basic")
            self.assertTrue(status.json["active"])

    def test_expert_activation_tier_is_removed(self):
        status = self.client.get("/api/activation-session?tier=expert")
        validation = self.client.post(
            "/api/validate-activation", json={"tier": "expert", "code": "unused"}
        )
        self.assertEqual(status.status_code, 400)
        self.assertEqual(validation.status_code, 400)


if __name__ == "__main__":
    unittest.main()