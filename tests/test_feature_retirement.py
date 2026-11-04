import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

os.environ.setdefault("DERIV_APP_ID", "test-app-id")
os.environ.setdefault("FLASK_ENV", "development")

import app as flask_app


class FeatureRetirementTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env_patch = patch.dict(os.environ, {
            "ACTIVATION_DATABASE_PATH": os.path.join(self.temp_dir.name, "activations.sqlite3"),
            "ACTIVATION_ADMIN_TOKEN": "test-admin-token",
            "ACTIVATION_CODE_PEPPER": "test-pepper",
        })
        self.env_patch.start()
        self.client = flask_app.app.test_client()
        self.login_as("CR100001")

    def tearDown(self):
        self.env_patch.stop()
        self.temp_dir.cleanup()

    def login_as(self, account_id):
        with self.client.session_transaction() as user_session:
            user_session["user"] = {
                "isAuthenticated": True,
                "activeAccount": {"account": account_id},
            }

    def test_challenge_api_is_removed(self):
        self.assertEqual(self.client.get("/api/challenge").status_code, 404)
        self.assertEqual(
            self.client.post("/api/challenge", json={"action": "start"}).status_code,
            404,
        )

    def test_activation_survives_logout_and_login_for_the_same_account(self):
        with patch.dict(os.environ, {"BASIC_BOT_CODES": "basic-only"}):
            redeemed = self.client.post(
                "/api/validate-activation", json={"tier": "basic", "code": "basic-only"}
            )
            self.assertTrue(redeemed.json["valid"])
            self.assertTrue(redeemed.json["permanent"])
            self.assertTrue(self.client.get("/api/activation-session?tier=basic").json["active"])
            self.assertEqual(self.client.post("/api/activation-check", json={"tier": "basic"}).status_code, 200)

            self.client.delete("/auth/session")
            self.login_as("CR100001")
            self.assertTrue(self.client.get("/api/activation-session?tier=basic").json["active"])
            self.assertEqual(self.client.post("/api/activation-check", json={"tier": "basic"}).status_code, 200)

            replay = self.client.post(
                "/api/validate-activation", json={"tier": "basic", "code": "basic-only"}
            )
            self.assertFalse(replay.json["valid"])

    def test_expert_activation_is_independent_and_account_scoped(self):
        with patch.dict(
            os.environ,
            {"BASIC_BOT_CODES": "basic-only", "EXPERT_BOT_CODES": "expert-only"},
        ):
            basic_code_for_expert = self.client.post(
                "/api/validate-activation",
                json={"tier": "expert", "code": "basic-only"},
            )
            self.assertFalse(basic_code_for_expert.json["valid"])

            expert_code_for_basic = self.client.post(
                "/api/validate-activation",
                json={"tier": "basic", "code": "expert-only"},
            )
            self.assertFalse(expert_code_for_basic.json["valid"])

            expert_code = self.client.post(
                "/api/validate-activation",
                json={"tier": "expert", "code": "expert-only"},
            )
            self.assertTrue(expert_code.json["valid"])
            self.assertTrue(self.client.get("/api/activation-session?tier=expert").json["active"])

            self.login_as("CR200002")
            self.assertFalse(self.client.get("/api/activation-session?tier=expert").json["active"])
            self.login_as("CR100001")
            self.assertTrue(self.client.get("/api/activation-session?tier=expert").json["active"])

    def test_expiration_and_admin_revocation_disable_activation(self):
        with patch.dict(os.environ, {"EXPERT_BOT_CODES": ""}):
            created = self.client.post(
                "/api/admin/activation-codes",
                headers={"X-Activation-Admin-Token": "test-admin-token"},
                json={
                    "tier": "expert",
                    "code": "expiring-code",
                    "expires_at": "2099-01-01T00:00:00Z",
                },
            )
            self.assertEqual(created.status_code, 201)
            redeemed = self.client.post(
                "/api/validate-activation", json={"tier": "expert", "code": "expiring-code"}
            )
            self.assertTrue(redeemed.json["valid"])

            connection = sqlite3.connect(os.environ["ACTIVATION_DATABASE_PATH"])
            connection.execute(
                "UPDATE bot_activations SET expires_at = ? WHERE account_id = ? AND tier = ?",
                ("2000-01-01T00:00:00Z", "CR100001", "expert"),
            )
            connection.commit()
            connection.close()
            self.assertFalse(self.client.get("/api/activation-session?tier=expert").json["active"])
            self.assertEqual(self.client.post("/api/activation-check", json={"tier": "expert"}).status_code, 403)

        with patch.dict(os.environ, {"EXPERT_BOT_CODES": ""}):
            created = self.client.post(
                "/api/admin/activation-codes",
                headers={"X-Activation-Admin-Token": "test-admin-token"},
                json={"tier": "expert", "code": "permanent-code"},
            )
            self.assertEqual(created.status_code, 201)
            redeemed = self.client.post(
                "/api/validate-activation", json={"tier": "expert", "code": "permanent-code"}
            )
            self.assertTrue(redeemed.json["valid"])
            revoked = self.client.post(
                "/api/admin/activations/revoke",
                headers={"X-Activation-Admin-Token": "test-admin-token"},
                json={"account_id": "CR100001", "tier": "expert"},
            )
            self.assertEqual(revoked.status_code, 200)
            self.assertFalse(self.client.get("/api/activation-session?tier=expert").json["active"])
            self.assertEqual(self.client.post("/api/activation-check", json={"tier": "expert"}).status_code, 403)

    def test_activation_status_requires_authenticated_account(self):
        self.client.delete("/auth/session")
        self.assertEqual(self.client.get("/api/activation-session?tier=basic").status_code, 401)


if __name__ == "__main__":
    unittest.main()