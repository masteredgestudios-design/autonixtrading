import os
import json
import time
import hmac
import hashlib
import base64
import secrets
import urllib.request
import urllib.error
import urllib.parse
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import datetime, timedelta, timezone
from pathlib import Path
from flask import (
    Flask,
    render_template,
    jsonify,
    request,
    session,
    redirect,
    url_for,
    make_response,
    send_file,
    send_from_directory,
)
from flask_cors import CORS
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR
load_dotenv(PROJECT_DIR / ".env.production")
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
REACT_DIST_DIR = BASE_DIR / "dist"

_secret = os.getenv("SESSION_SECRET", "")
if not _secret:
    import warnings
    warnings.warn(
        "SESSION_SECRET is not set — using a random key. Sessions will not "
        "survive server restarts. Set SESSION_SECRET in Replit Secrets.",
        stacklevel=1,
    )
    _secret = secrets.token_hex(32)
app.secret_key = _secret

app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = (
    os.getenv("FLASK_ENV", "production") != "development"
)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)

_ALLOWED_ORIGINS = {
    o.rstrip("/")
    for o in filter(None, [
        os.getenv("REDIRECT_URL", ""),
        os.getenv("CORS_ORIGIN", ""),
    ])
}

_EXCHANGE_RATE_CACHE = {"rate": None, "fetched_at": 0.0}
_EXCHANGE_RATE_CACHE_TTL = 3600
CORS(
    app,
    supports_credentials=True,
    origins=list(_ALLOWED_ORIGINS) if _ALLOWED_ORIGINS else "*",
)


@app.after_request
def _security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if not response.cache_control.no_store:
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://unpkg.com https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; "
            "img-src 'self' data: https:; "
            "connect-src 'self' wss://ws.derivws.com wss://*.derivws.com https://api.deriv.com https://auth.deriv.com https://api.derivws.com https://open.er-api.com https://api.frankfurter.app https://api.coingecko.com https://query1.finance.yahoo.com; "
            "frame-ancestors *;",
        )
    return response


def _get_usd_kes_rate():
    """Return a cached USD/KES rate from a live, no-key exchange feed."""
    now = time.time()
    if (_EXCHANGE_RATE_CACHE["rate"] is not None and
            now - _EXCHANGE_RATE_CACHE["fetched_at"] < _EXCHANGE_RATE_CACHE_TTL):
        return _EXCHANGE_RATE_CACHE["rate"]

    url = "https://open.er-api.com/v6/latest/USD"
    try:
        raw = _http_get(url, timeout=8)
        payload = json.loads(raw)
        rate = float(payload["rates"]["KES"])
        if rate <= 0:
            raise ValueError("non-positive exchange rate")
    except Exception as exc:
        app.logger.warning("USD/KES rate refresh failed: %s", exc)
        if _EXCHANGE_RATE_CACHE["rate"] is None:
            raise
        return _EXCHANGE_RATE_CACHE["rate"]

    _EXCHANGE_RATE_CACHE.update(rate=rate, fetched_at=now)
    return rate

DATA_DIR = BASE_DIR / "data"
DERIV_APP_ID = os.getenv("DERIV_APP_ID") or os.getenv("NEXT_PUBLIC_DERIV_APP_ID")
REDIRECT_URL = os.getenv("REDIRECT_URL", "").rstrip("/")

# Fail fast at startup if DERIV_APP_ID is missing (required for both flows)
if not os.getenv("DERIV_APP_ID"):
    raise RuntimeError(
        "Missing required environment variable: DERIV_APP_ID. "
        "Please set it in your .env file or Replit Secrets."
    )
# DERIV_LEGACY_APP_ID is optional — falls back to DERIV_APP_ID if it looks numeric,
# otherwise defaults to empty (PKCE-only mode).
if not os.getenv("DERIV_LEGACY_APP_ID"):
    _raw = os.getenv("DERIV_APP_ID", "")
    if _raw.isdigit():
        os.environ["DERIV_LEGACY_APP_ID"] = _raw
    else:
        os.environ["DERIV_LEGACY_APP_ID"] = ""

# ─── Deriv OAuth 2.0 + PKCE endpoints (auth.deriv.com — new platform) ────────
# Source: https://auth.deriv.com/.well-known/openid-configuration
DERIV_AUTH_URL = "https://auth.deriv.com/oauth2/auth"
DERIV_TOKEN_URL = "https://auth.deriv.com/oauth2/token"
DERIV_REVOKE_URL = "https://auth.deriv.com/oauth2/revoke"
DERIV_LOGOUT_URL = "https://auth.deriv.com/oauth2/sessions/logout"

# OAuth scopes documented by Deriv for this application. Payment permission is
# required by the wallet transfer API; existing sessions must re-authenticate.
DERIV_SCOPES = "trade account_manage payment"

# Userinfo endpoint — fallback for newer accounts that don't get per-account tokens in the exchange
DERIV_USERINFO_URL = "https://auth.deriv.com/oauth2/userinfo"

# Legacy WebSocket app_id — used for wss://ws.derivws.com connections (separate from OAuth client_id)
DERIV_LEGACY_APP_ID = os.getenv("DERIV_LEGACY_APP_ID")
DERIV_WS_APP_ID = DERIV_LEGACY_APP_ID
DERIV_WALLET_API_BASE = "https://api.derivws.com/wallet/v1"
TRANSFER_PLATFORMS = {"mt5", "ctrader", "options", "crypto-exchange", "tradingview"}
TRANSFER_DIRECTIONS = {"from_wallet", "to_wallet"}


# ─── PKCE helpers ─────────────────────────────────────────────────────────────


def _pkce_verifier() -> str:
    """Generate a cryptographically random code_verifier (RFC 7636).
    32 random bytes → 43 base64url chars (exactly the RFC minimum).
    """
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()


def _pkce_challenge(verifier: str) -> str:
    """Derive code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def _pkce_state_encode(nonce: str, verifier: str) -> str:
    """Pack nonce + verifier into the OAuth state parameter, HMAC-signed.

    Format: ``{nonce}|{verifier}|{hmac_hex}``

    Using the state to carry the verifier means we never depend on the
    session cookie surviving the Deriv redirect — large existing sessions
    (e.g. containing JWT tokens) have caused the cookie to be silently
    dropped by the browser, losing the verifier and breaking PKCE.
    """
    secret = app.secret_key
    if isinstance(secret, str):
        secret = secret.encode()
    payload = f"{nonce}|{verifier}"
    sig = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}|{sig}"


def _pkce_state_decode(state: str):
    """Unpack and verify a state created by _pkce_state_encode.

    Returns ``(nonce, verifier)`` on success, ``None`` if the signature
    is invalid or the format is wrong.
    """
    parts = state.split("|", 2)
    if len(parts) != 3:
        return None
    nonce, verifier, sig = parts
    secret = app.secret_key
    if isinstance(secret, str):
        secret = secret.encode()
    expected = hmac.new(
        secret, f"{nonce}|{verifier}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    return nonce, verifier


def _callback_uri() -> str:
    """
    Absolute redirect_uri sent to Deriv.
    Must match the URI registered in the Deriv app EXACTLY — no path appended.
    """
    return REDIRECT_URL or request.url_root.rstrip("/")


# ─── HTTP helpers ──────────────────────────────────────────────────────────────


def _post_form(url: str, payload: dict, timeout: int = 15):
    """POST application/x-www-form-urlencoded and return parsed JSON.

    Headers are set to match a real browser request so Cloudflare does not
    flag the server-side token exchange as automated traffic (CF-1010).
    """
    data = urllib.parse.urlencode(payload).encode()
    origin = REDIRECT_URL or "https://app.deriv.com"
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Origin": origin,
            "Referer": origin + "/",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        # Handle gzip-compressed responses (Accept-Encoding: gzip)
        import gzip as _gzip

        try:
            raw = _gzip.decompress(raw)
        except Exception:
            pass
        return json.loads(raw.decode())


def _try_revoke(token: str) -> None:
    """Best-effort token revocation — never raises."""
    try:
        _post_form(DERIV_REVOKE_URL, {"token": token, "client_id": DERIV_APP_ID})
    except Exception:
        pass


def _is_api_token(token: str) -> bool:
    """
    Return True if token looks like a Deriv API token (a1-xxx, short alphanumeric).
    Returns False for OAuth JWTs (eyJ...) which the WebSocket authorize call rejects.
    """
    if not token:
        return False
    if "." in token:  # JWTs contain dots
        return False
    if len(token) > 120:  # API tokens are short; JWTs are hundreds of chars
        return False
    return True


def _get_json(
    url: str, access_token: str, extra_headers: dict = None, timeout: int = 10
) -> dict:
    """GET a JSON endpoint with Bearer auth. Returns {} on any failure."""
    try:
        origin = REDIRECT_URL or "https://app.deriv.com"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Origin": origin,
            "Referer": origin + "/",
        }
        if extra_headers:
            headers.update(extra_headers)
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            import gzip as _gz

            try:
                raw = _gz.decompress(raw)
            except Exception:
                pass
            return json.loads(raw.decode())
    except Exception as exc:
        app.logger.warning(f"[REST] GET {url} failed: {exc}")
        return {}


def _post_json(
    url: str,
    access_token: str,
    body: dict = None,
    extra_headers: dict = None,
    timeout: int = 10,
) -> dict:
    """POST JSON to a REST endpoint with Bearer auth. Returns {} on any failure."""
    try:
        origin = REDIRECT_URL or "https://app.deriv.com"
        payload = json.dumps(body or {}).encode()
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Origin": origin,
            "Referer": origin + "/",
        }
        if extra_headers:
            headers.update(extra_headers)
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            import gzip as _gz

            try:
                raw = _gz.decompress(raw)
            except Exception:
                pass
            return json.loads(raw.decode())
    except Exception as exc:
        app.logger.warning(f"[REST] POST {url} failed: {exc}")
        return {}


def _fetch_rest_accounts(access_token: str) -> list:
    """
    Call Deriv's new REST API to list trading accounts for the authenticated user.
    Returns a list of account dicts, or [] on failure.
    """
    resp = _get_json(
        "https://api.derivws.com/trading/v1/options/accounts",
        access_token,
        extra_headers={"Deriv-App-ID": DERIV_WS_APP_ID},
    )
    app.logger.info(
        f"[REST] accounts response keys: {sorted(resp.keys()) if resp else 'empty'}"
    )
    # Try various response shapes
    accounts = (
        resp.get("accounts")
        or resp.get("data")
        or (resp.get("items") if isinstance(resp.get("items"), list) else None)
        or []
    )
    if not isinstance(accounts, list) and isinstance(resp, list):
        accounts = resp
    app.logger.info(
        f"[REST] found {len(accounts)} accounts"
    )
    return accounts


def _fetch_otp_ws_url(access_token: str, account_id: str) -> dict:
    """
    Call Deriv's OTP endpoint to get an authenticated WebSocket URL for trading.
    POST https://api.derivws.com/trading/v1/options/accounts/{accountId}/otp
    Returns the full response dict; caller inspects 'url', 'otp', 'token', etc.

    IMPORTANT: The Deriv-App-ID header must be the numeric WS app ID (DERIV_WS_APP_ID),
    NOT the alphanumeric OIDC client ID (DERIV_APP_ID). Using the OIDC client ID causes
    Deriv to embed the wrong app_id in the returned WS URL, which leads to
    InputValidationFailed errors on buy requests.
    """
    if not account_id:
        return {}
    url = f"https://api.derivws.com/trading/v1/options/accounts/{account_id}/otp"
    resp = _post_json(
        url,
        access_token,
        body={},
        extra_headers={"Deriv-App-ID": DERIV_WS_APP_ID},
    )
    app.logger.info(
        f"[OTP] account={account_id} response keys: {sorted(resp.keys()) if resp else 'empty'}"
    )
    return resp


def _fetch_userinfo(access_token: str) -> dict:
    """
    Call Deriv's OIDC userinfo endpoint with the OAuth access_token.
    Returns the parsed JSON dict, or {} on failure.
    The response typically includes an 'accounts' list with per-account
    Deriv API tokens for newer account types.
    """
    try:
        origin = REDIRECT_URL or "https://app.deriv.com"
        req = urllib.request.Request(
            DERIV_USERINFO_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.9",
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Origin": origin,
                "Referer": origin + "/",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return {}


# ─── Markets helper ───────────────────────────────────────────────────────────


def load_markets():
    with open(DATA_DIR / "markets.json") as f:
        return json.load(f)


# ─── Page routes ──────────────────────────────────────────────────────────────


def _render_index(user=None, auth_error=None, status=200):
    return render_template(
        "index.html",
        deriv_app_id=DERIV_APP_ID,
        ws_app_id=DERIV_WS_APP_ID,
        redirect_url=REDIRECT_URL,
        markets=load_markets(),
        session_data=_safe_for_template(user),
        auth_error=auth_error,
    ), status


def _build_accounts_session(
    accounts: list, access_token: str, refresh_token=None, expires_in: int = 3600
):
    """Shared helper — builds and stores the user session dict.

    JWT tokens are stored under private keys (_token) so they are available
    server-side for API calls but are stripped before being sent to the
    browser via tojson (see _safe_for_template).
    """
    active = next((a for a in accounts if not a["isVirtual"]), accounts[0])
    session["user"] = {
        "isAuthenticated": True,
        "activeAccount": active,
        "accounts": accounts,
        # Private keys (underscore prefix) are stripped by _safe_for_template
        "_accessToken": access_token,
        "_refreshToken": refresh_token,
        "_tokenExpiresAt": (
            datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        ).isoformat(),
    }
    session.permanent = True


def _safe_for_template(user: dict) -> dict:
    """Return a sanitised copy of the session user dict safe to pass to tojson.

    Strips any key starting with '_' (server-side only) and replaces JWT
    tokens (which contain dots and are 100s of chars) in account dicts with
    an empty string so the template never serialises large opaque blobs into
    the page.  The wsUrl field is kept intact so the frontend can open an
    authenticated WebSocket directly.
    """
    if not user:
        return user

    def clean_account(acct: dict) -> dict:
        out = {}
        for k, v in acct.items():
            if k.startswith("_"):
                continue
            # Never expose account tokens — the server creates short-lived WS URLs.
            if k == "token":
                out[k] = ""
            # Always coerce balance to float so "%.2f"|format() never crashes
            elif k == "balance":
                try:
                    out[k] = float(v or 0)
                except (TypeError, ValueError):
                    out[k] = 0.0
            else:
                out[k] = v
        return out

    safe = {}
    for k, v in user.items():
        if k.startswith("_"):
            continue
        if k == "activeAccount" and isinstance(v, dict):
            safe[k] = clean_account(v)
        elif k == "accounts" and isinstance(v, list):
            safe[k] = [clean_account(a) if isinstance(a, dict) else a for a in v]
        else:
            safe[k] = v
    return safe


def _handle_legacy_callback():
    """
    Legacy OAuth callback: Deriv returns tokens directly as query parameters.
    Format: ?acct1=CR123&token1=a1-xxx&cur1=usd&acct2=VRTC456&token2=a1-yyy&cur2=usd
    No code exchange needed — tokens are ready to use immediately.
    """
    accounts = []
    i = 1
    while True:
        acct = request.args.get(f"acct{i}")
        token = request.args.get(f"token{i}")
        cur = request.args.get(f"cur{i}", "USD")
        if not acct or not token:
            break
        is_virtual = acct.upper().startswith(("VRTC", "VRW", "DTML"))
        accounts.append(
            {
                "account": acct,
                "token": token,
                "currency": cur.upper(),
                "isVirtual": is_virtual,
                "accountType": "virtual" if is_virtual else "real",
                "balance": 0,
            }
        )
        i += 1

    if not accounts:
        return _render_index(
            auth_error="No account tokens received from Deriv", status=400
        )

    _build_accounts_session(accounts, access_token=accounts[0]["token"])
    return redirect("/")


def _decode_jwt_payload(token: str) -> dict:
    """
    Decode a JWT payload without signature verification.
    Used to inspect claims that Deriv may embed (e.g. account list, aud).
    Returns {} on any error.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(padded).decode())
    except Exception:
        return {}


def _handle_oauth_callback():
    """
    OIDC + PKCE callback handler.
    Deriv redirects with ?code=&state= — verify state, exchange code for token.
    Also handles the edge case where a new account arrives here after being
    routed through the legacy endpoint (no pkce_state in session).
    """
    error = request.args.get("error")
    if error:
        session.pop("pkce_nonce", None)
        session.pop("pkce_verifier", None)  # legacy key — safe to pop
        session.pop("pkce_redirect", None)
        return _render_index(
            auth_error="Deriv login was cancelled or failed. Please try again.",
            status=400,
        )

    returned_state = request.args.get("state", "")
    redirect_uri = session.pop("pkce_redirect", _callback_uri())
    code = request.args.get("code", "")

    # ── Extract verifier from signed state (primary path) ────────────────────
    # The verifier is embedded in the state so it survives even when the
    # session cookie is lost during the Deriv redirect (e.g. cookie too large).
    decoded = _pkce_state_decode(returned_state)
    if decoded:
        state_nonce, code_verifier = decoded
        stored_nonce = session.pop("pkce_nonce", None)
        if not stored_nonce or not secrets.compare_digest(state_nonce, stored_nonce):
            app.logger.warning("[OIDC] nonce mismatch — possible CSRF or stale session")
            return _render_index(
                auth_error="Login session expired or invalid. Please try again.",
                status=400,
            )
        app.logger.info("[OIDC] verifier recovered from signed state")
    else:
        # Fallback: old-style session-stored verifier (legacy support)
        code_verifier = session.pop("pkce_verifier", None)
        stored_state = session.pop("pkce_nonce", None) or session.pop(
            "pkce_state", None
        )
        if not stored_state or not secrets.compare_digest(returned_state, stored_state):
            app.logger.warning("[OIDC] state mismatch — possible CSRF or stale session")
            return _render_index(
                auth_error="Login session expired or invalid. Please try again.",
                status=400,
            )
        if code_verifier:
            app.logger.info("[OIDC] verifier recovered from session cookie (legacy)")
        else:
            app.logger.warning(
                "[OIDC] no verifier found in state or session — PKCE will fail"
            )

    if not code:
        return _render_index(
            auth_error="No authorization code received from Deriv.", status=400
        )

    # ── Token exchange ────────────────────────────────────────────────────────
    exchange_payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": DERIV_APP_ID,
        "redirect_uri": redirect_uri,
    }
    if code_verifier:
        exchange_payload["code_verifier"] = code_verifier
    app.logger.info(
        f"[OIDC] exchange payload keys: {sorted(exchange_payload.keys())}, verifier_len={len(code_verifier) if code_verifier else 0}"
    )

    try:
        token_data = _post_form(DERIV_TOKEN_URL, exchange_payload)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        app.logger.error(f"[OIDC] token exchange HTTP error: {body}")
        return jsonify({"error": "token_exchange_failed", "detail": body}), 502
    except Exception as e:
        app.logger.error(f"[OIDC] token exchange error: {e}")
        return jsonify({"error": "token_exchange_error", "detail": str(e)}), 502

    # ── Log the raw response keys for debugging ───────────────────────────────
    app.logger.info(f"[OIDC] token_data keys: {sorted(token_data.keys())}")

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)

    if not access_token:
        app.logger.error(f"[OIDC] no access_token in response: {token_data}")
        return jsonify({"error": "no_access_token", "raw": token_data}), 502

    def _build_account(a, fallback_token):
        account_id = a.get("loginid") or a.get("account", "")
        acct_upper = account_id.upper()
        # Virtual / demo prefixes: VRTC (old demo), VRW, DTML (new demo)
        # Real prefixes: CR, MF, MLT, MX, DOT (new real), DML (new real)
        is_virtual = (
            acct_upper.startswith(("VRTC", "VRW", "DTML"))
            or bool(a.get("is_virtual"))
            or a.get("account_type") == "virtual"
        )
        raw_tok = a.get("token") or a.get("api_token") or fallback_token
        return {
            "account": account_id,
            "token": raw_tok,
            "currency": (a.get("currency") or "USD").upper(),
            "isVirtual": is_virtual,
            "accountType": "virtual" if is_virtual else "real",
            "balance": float(a.get("balance") or 0),
        }

    # ── Try every source for per-account API tokens ───────────────────────────

    # Source 1: token exchange response accounts array
    raw_accounts = (
        token_data.get("accounts")
        or token_data.get("account_list")
        or token_data.get("acct_list")
        or []
    )
    app.logger.info(f"[OIDC] raw_accounts from exchange: {len(raw_accounts)}")

    # Source 2: JWT payload (access_token or id_token may carry account claims)
    if not raw_accounts or any(
        not _is_api_token(a.get("token") or a.get("api_token", ""))
        for a in raw_accounts
    ):
        for jwt_candidate in filter(
            None,
            [
                token_data.get("id_token"),
                access_token if "." in access_token else None,
            ],
        ):
            payload = _decode_jwt_payload(jwt_candidate)
            app.logger.info(f"[OIDC] JWT payload keys: {sorted(payload.keys())}")
            jwt_accts = payload.get("accounts") or payload.get("account_list") or []
            if jwt_accts:
                app.logger.info(
                    f"[OIDC] found {len(jwt_accts)} accounts in JWT payload"
                )
                raw_accounts = jwt_accts
                break

    # Source 3: OIDC userinfo endpoint (requires openid scope — may return 401)
    if not raw_accounts or any(
        not _is_api_token(a.get("token") or a.get("api_token", ""))
        for a in raw_accounts
    ):
        userinfo = _fetch_userinfo(access_token)
        app.logger.info(f"[OIDC] userinfo keys: {sorted(userinfo.keys())}")
        ui_accts = userinfo.get("accounts") or userinfo.get("account_list") or []
        if ui_accts:
            app.logger.info(f"[OIDC] found {len(ui_accts)} accounts from userinfo")
            raw_accounts = ui_accts

    # ── Build account list ────────────────────────────────────────────────────
    if raw_accounts:
        accounts = [_build_account(a, access_token) for a in raw_accounts]
        app.logger.info(
            f"[OIDC] session accounts: "
            f"{[{'id': a['account'], 'token_type': 'api' if _is_api_token(a['token']) else 'jwt'} for a in accounts]}"
        )
    else:
        # Last resort: single account from top-level token_data fields
        account_id = token_data.get("loginid") or token_data.get("acct1") or ""
        app.logger.warning(
            f"[OIDC] no accounts array found — falling back to single account '{account_id}'"
        )
        is_virtual = account_id.upper().startswith(("VRTC", "VRW", "DOT"))
        accounts = [
            {
                "account": account_id,
                "token": access_token,
                "currency": (token_data.get("currency") or "USD").upper(),
                "isVirtual": is_virtual,
                "accountType": "virtual" if is_virtual else "real",
                "balance": 0,
            }
        ]

    # If every account still has a JWT instead of a real API token, the legacy
    # WS `authorize` call will fail.  Try the new REST → OTP flow instead:
    # GET accounts list, then POST /otp per account to get a tradeable WS URL.
    all_bad = all(not _is_api_token(a["token"]) for a in accounts)
    if all_bad:
        app.logger.warning(
            f"[OIDC] no valid API tokens — trying REST accounts + OTP flow. "
            f"token_data keys: {sorted(token_data.keys())}"
        )

        # Step 1: try to get account list from the new REST API
        rest_accts = _fetch_rest_accounts(access_token)

        # Step 2: if REST gave us accounts, rebuild the list from them
        if rest_accts:
            accounts = []
            for ra in rest_accts:
                acct_id = (
                    ra.get("loginid")
                    or ra.get("account_id")
                    or ra.get("id")
                    or ra.get("account")
                    or ""
                )
                is_virt = str(acct_id).upper().startswith(("VRTC", "VRW", "DOT"))
                accounts.append(
                    {
                        "account": acct_id,
                        "token": access_token,  # JWT — will be replaced by OTP below
                        "currency": (ra.get("currency") or "USD").upper(),
                        "isVirtual": is_virt,
                        "accountType": "virtual" if is_virt else "real",
                        "balance": float(ra.get("balance") or 0),
                    }
                )
        else:
            # Fall back: decode JWT to get account identity
            jwt_payload = _decode_jwt_payload(access_token)
            acct_id = jwt_payload.get("loginid") or jwt_payload.get("sub") or ""
            is_virt = str(acct_id).upper().startswith(("VRTC", "VRW", "DOT"))
            if acct_id:
                accounts = [
                    {
                        "account": acct_id,
                        "token": access_token,
                        "currency": "USD",
                        "isVirtual": is_virt,
                        "accountType": "virtual" if is_virt else "real",
                        "balance": 0,
                    }
                ]

        # Step 3: for each account, get a WS-ready OTP URL from the REST API
        for acct in accounts:
            acct_id = acct.get("account", "")
            if not acct_id:
                continue
            otp_resp = _fetch_otp_ws_url(access_token, acct_id)
            if otp_resp:
                # Response may wrap the payload in a top-level `data` dict
                payload = (
                    otp_resp.get("data")
                    if isinstance(otp_resp.get("data"), dict)
                    else otp_resp
                )
                app.logger.info(
                    f"[OTP] {acct_id}: payload keys: {sorted(payload.keys())}"
                )
                # The endpoint may return `url` (full WS URL) or `otp` (token fragment)
                ws_url = (
                    payload.get("url")
                    or payload.get("wsUrl")
                    or payload.get("ws_url")
                    or otp_resp.get("url")
                    or otp_resp.get("wsUrl")
                    or otp_resp.get("ws_url")
                )
                otp = (
                    payload.get("otp")
                    or payload.get("token")
                    or payload.get("access_token")
                    or otp_resp.get("otp")
                    or otp_resp.get("token")
                    or otp_resp.get("access_token")
                )
                if ws_url:
                    acct["wsUrl"] = ws_url
                    app.logger.warning(f"[OTP] {acct_id}: got wsUrl = {ws_url}")
                elif otp and _is_api_token(otp):
                    acct["token"] = otp
                    app.logger.warning(f"[OTP] {acct_id}: got API-style OTP token")
                else:
                    # Construct fallback URL from bare OTP token using the NUMERIC WS app_id
                    if otp:
                        ws_url = f"wss://ws.derivws.com/websockets/v3?app_id={DERIV_WS_APP_ID}&otp={otp}"
                        acct["wsUrl"] = ws_url
                        app.logger.warning(
                            f"[OTP] {acct_id}: constructed wsUrl from otp token = {ws_url}"
                        )
                    else:
                        app.logger.warning(
                            f"[OTP] {acct_id}: unknown response shape — "
                            f"top keys: {list(otp_resp.keys())}, "
                            f"data keys: {list(payload.keys())}"
                        )

        # Step 4: check if OTP approach worked (account has wsUrl or a real token)
        otp_ok = any(
            _is_api_token(a.get("token", "")) or a.get("wsUrl") for a in accounts
        )

        if otp_ok:
            app.logger.info("[OIDC] OTP flow succeeded — building session")
            _build_accounts_session(accounts, access_token, refresh_token, expires_in)
        else:
            # OTP also failed.
            # If we have a numeric legacy app_id, silently retry via the legacy
            # OAuth flow — it returns real API tokens for all account types
            # without requiring any OTP / REST dance.
            if DERIV_LEGACY_APP_ID:
                app.logger.warning(
                    "[OIDC] OTP flow failed — auto-redirecting to legacy OAuth "
                    "so the user gets real API tokens without manual action"
                )
                session.clear()  # don't keep a half-baked session
                params = urllib.parse.urlencode({"app_id": DERIV_LEGACY_APP_ID})
                return redirect(f"https://oauth.deriv.com/oauth2/authorize?{params}")

            # No legacy app_id available — store a minimal session and show banner
            app.logger.warning(
                "[OIDC] OTP flow failed and no legacy app_id — showing needsLegacyLink banner"
            )
            jwt_payload = _decode_jwt_payload(access_token)
            display_id = jwt_payload.get("sub") or jwt_payload.get("loginid") or ""
            session["user"] = {
                "isAuthenticated": False,
                "needsLegacyLink": True,
                "displayId": display_id,
                "accounts": [],
                "activeAccount": None,
                "_accessToken": access_token,
            }
            session.permanent = True

        # After successful authentication, redirect to Dashboard
        app.logger.info("[OAuth] Redirecting to /dashboard after successful login")
        return redirect("/dashboard")

    _build_accounts_session(accounts, access_token, refresh_token, expires_in)
    # After successful authentication, redirect to Dashboard
    app.logger.info("[OAuth] Redirecting to /dashboard after successful login")
    return redirect("/dashboard")


@app.route("/")
def index():
    """
    Home page — also serves as the OAuth callback target for both flows:
      • New OIDC:  ?code=...&state=...      → PKCE token exchange
      • Legacy:    ?acct1=...&token1=...    → tokens already in URL
    """
    if request.args.get("code") or request.args.get("error"):
        return _handle_oauth_callback()
    if request.args.get("acct1"):
        return _handle_legacy_callback()

    user = session.get("user")
    try:
        markets = load_markets()
    except Exception as exc:
        app.logger.error(f"[index] load_markets failed: {exc}")
        markets = {}
    try:
        return render_template(
            "autonix.html",
            deriv_app_id=DERIV_APP_ID,
            ws_app_id=DERIV_WS_APP_ID,
            redirect_url=REDIRECT_URL,
            markets=markets,
            session_data=_safe_for_template(user),
        )
    except Exception as exc:
        app.logger.error(f"[index] render_template failed: {exc}", exc_info=True)
        # Clear potentially-corrupt session and serve a bare fallback
        session.pop("user", None)
        return render_template(
            "autonix.html",
            deriv_app_id=DERIV_APP_ID,
            ws_app_id=DERIV_WS_APP_ID,
            redirect_url=REDIRECT_URL,
            markets=markets,
            session_data=None,
        )


@app.route("/autonix")
def autonix():
    return redirect("/", 301)


@app.route("/ATDbot", defaults={"path": ""})
@app.route("/ATDbot/<path:path>")
def atd_bot(path):
    """Serve the production React build under the Flask application."""
    requested_file = REACT_DIST_DIR / path
    if path and requested_file.is_file():
        return send_from_directory(REACT_DIST_DIR, path)
    return send_from_directory(REACT_DIST_DIR, "index.html")


@app.route("/reactbotapp", defaults={"path": ""})
@app.route("/reactbotapp/<path:path>")
def reactbotapp(path):
    return redirect(f"/ATDbot/{path}" if path else "/ATDbot")


@app.route("/assets/<path:path>")
def react_assets(path):
    """Serve React assets requested from the root public path."""
    return send_from_directory(REACT_DIST_DIR / "assets", path)


@app.route("/js/smartcharts/<path:path>")
def react_smartcharts(path):
    """Serve SmartCharts files requested from the root public path."""
    return send_from_directory(REACT_DIST_DIR / "js" / "smartcharts", path)


@app.before_request
def serve_react_async_assets():
    """Serve cached React async chunks without shadowing Flask's static files."""
    asset_prefixes = ("/static/js/async/", "/static/css/async/")
    matching_prefix = next((prefix for prefix in asset_prefixes if request.path.startswith(prefix)), None)
    if not matching_prefix:
        return None

    relative_path = request.path[len("/static/"):]
    requested_file = REACT_DIST_DIR / "static" / relative_path
    if requested_file.is_file():
        return send_from_directory(REACT_DIST_DIR / "static", relative_path)
    return None


@app.route("/trader")
def trader():
    user = session.get("user")
    try:
        markets = load_markets()
    except Exception as exc:
        app.logger.error(f"[trader] load_markets failed: {exc}")
        markets = {}
    return render_template(
        "index.html",
        deriv_app_id=DERIV_APP_ID,
        ws_app_id=DERIV_WS_APP_ID,
        redirect_url=REDIRECT_URL,
        markets=markets,
        session_data=_safe_for_template(user),
    )


@app.route("/invest")
def invest():
    user = session.get("user")
    return render_template(
        "invest.html",
        deriv_app_id=DERIV_APP_ID,
        ws_app_id=DERIV_WS_APP_ID,
        redirect_url=REDIRECT_URL,
        session_data=_safe_for_template(user),
    )


@app.route("/bots")
def bots():
    user = session.get("user")
    return render_template(
        "bots.html",
        deriv_app_id=DERIV_APP_ID,
        ws_app_id=DERIV_WS_APP_ID,
        redirect_url=REDIRECT_URL,
        session_data=_safe_for_template(user),
    )


@app.route("/dbot")
def dbot():
    return redirect("/ATDbot")


@app.route("/terms")
def terms():
    user = session.get("user")
    return render_template(
        "terms.html",
        deriv_app_id=DERIV_APP_ID,
        ws_app_id=DERIV_WS_APP_ID,
        redirect_url=REDIRECT_URL,
        session_data=_safe_for_template(user),
    )




@app.route("/dashboard")
def dashboard():
    user = session.get("user")
    response = make_response(render_template(
        "dashboard.html",
        deriv_app_id=DERIV_APP_ID,
        ws_app_id=DERIV_WS_APP_ID,
        redirect_url=REDIRECT_URL,
        session_data=_safe_for_template(user),
    ))
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.route("/journal")
def journal():
    user = session.get("user")
    return render_template(
        "journal.html",
        deriv_app_id=DERIV_APP_ID,
        ws_app_id=DERIV_WS_APP_ID,
        redirect_url=REDIRECT_URL,
        session_data=_safe_for_template(user),
    )
# ─── OAuth 2.0 + PKCE auth routes ─────────────────────────────────────────────


@app.route("/auth/login")
def auth_login():
    """
    Step 1: Generate PKCE params + anti-CSRF state, redirect to Deriv.

    The code_verifier is embedded inside the signed ``state`` parameter so
    that the PKCE proof never depends on the session cookie surviving the
    redirect.  Large existing session cookies (e.g. JWT tokens from a
    previous OTP login) can silently exceed 4 KB and be dropped by the
    browser — this design is immune to that failure mode.
    """
    code_verifier = _pkce_verifier()
    code_challenge = _pkce_challenge(code_verifier)
    nonce = secrets.token_urlsafe(32)
    redirect_uri = _callback_uri()

    # Embed verifier in signed state so we never rely on cookie for PKCE
    state = _pkce_state_encode(nonce, code_verifier)

    # Keep session small: clear any existing user data before auth so the
    # PKCE session keys don't push the cookie over 4 KB
    session.pop("user", None)
    session["pkce_nonce"] = nonce  # used for optional CSRF check
    session["pkce_redirect"] = redirect_uri  # redirect_uri must match exactly
    session.modified = True

    params = urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": DERIV_APP_ID,
            "redirect_uri": redirect_uri,
            "scope": DERIV_SCOPES,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "app_id": DERIV_LEGACY_APP_ID,
        }
    )

    return redirect(f"{DERIV_AUTH_URL}?{params}")


@app.route("/auth/login/legacy")
def auth_login_legacy():
    """
    Legacy OAuth flow: redirect to oauth.deriv.com with app_id=127424.
    Deriv returns tokens directly as query params (no code exchange).
    """
    redirect_uri = _callback_uri()
    params = urllib.parse.urlencode(
        {
            "app_id": DERIV_LEGACY_APP_ID,
        }
    )
    return redirect(f"https://oauth.deriv.com/oauth2/authorize?{params}")


@app.route("/auth/callback")
def auth_callback():
    """Alias — Deriv now redirects to the root; this handles any legacy links."""
    return _handle_oauth_callback()


@app.route("/auth/refresh", methods=["POST"])
def auth_refresh():
    """
    Silently exchange a refresh token for a new access token.
    Called by the frontend before the access token expires.
    """
    user = session.get("user")
    if not user:
        return jsonify({"error": "unauthenticated"}), 401

    refresh_token = user.get("_refreshToken")
    if not refresh_token:
        return jsonify({"error": "no_refresh_token"}), 400

    try:
        token_data = _post_form(
            DERIV_TOKEN_URL,
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": DERIV_APP_ID,
            },
        )
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        # Refresh token invalid or expired — force re-login
        session.pop("user", None)
        return jsonify({"error": "refresh_failed", "detail": body}), 401
    except Exception as e:
        return jsonify({"error": "refresh_error", "detail": str(e)}), 502

    new_access = token_data.get("access_token")
    new_refresh = token_data.get("refresh_token", refresh_token)
    expires_in = token_data.get("expires_in", 3600)

    if not new_access:
        return jsonify({"error": "no_access_token"}), 502

    user["_accessToken"] = new_access
    user["_refreshToken"] = new_refresh
    user["_tokenExpiresAt"] = (
        datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    ).isoformat()
    # Update the per-account tokens if the response includes them
    for acc in user.get("accounts", []):
        acc["token"] = new_access
    if user.get("activeAccount"):
        user["activeAccount"]["token"] = new_access

    session["user"] = user
    session.modified = True

    return jsonify(
        {
            "success": True,
            "expiresAt": user["_tokenExpiresAt"],
            "accessToken": new_access,
        }
    )


# ─── Auth API routes ───────────────────────────────────────────────────────────


@app.route("/auth/session", methods=["GET"])
def get_session():
    user = session.get("user")
    if not user:
        return jsonify({"isAuthenticated": False})
    # Return account metadata only. Tokens remain in Flask's server-side session.
    safe = _safe_for_template(user)
    return jsonify(safe)


def _wallet_api_request(method, path, access_token, payload=None):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
        "Deriv-App-ID": DERIV_APP_ID,
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"{DERIV_WALLET_API_BASE}{path}", data=body, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            details = json.loads(raw)
        except (TypeError, ValueError):
            details = {"error": raw or error.reason}
        return error.code, details
    except (urllib.error.URLError, TimeoutError) as error:
        return 503, {"error": "wallet_service_unavailable", "detail": str(error)}


def _transfer_user():
    user = session.get("user")
    if not user or not user.get("isAuthenticated"):
        return None, (jsonify({"error": "unauthorized"}), 401)
    token = user.get("_accessToken")
    if not token:
        return None, (jsonify({"error": "reauthentication_required"}), 401)
    return (user, token), None


def _wallet_rows(payload):
    data = payload.get("data", payload) if isinstance(payload, dict) else {}
    if isinstance(data, dict):
        rows = data.get("wallets") or data.get("items") or data.get("accounts") or []
    else:
        rows = data
    return [row for row in rows if isinstance(row, dict)]


def _wallet_record(wallets, wallet_id):
    return next(
        (
            wallet for wallet in wallets
            if str(wallet.get("wallet_id") or wallet.get("id") or "") == str(wallet_id)
        ),
        None,
    )


def _real_session_accounts(user):
    return {
        str(account.get("account")): account
        for account in user.get("accounts", [])
        if account.get("account")
        and not account.get("isVirtual")
        and account.get("accountType") == "real"
    }


def _refresh_session_account_balances(user, token):
    rows = _fetch_rest_accounts(token)
    if not rows:
        return
    refreshed = {}
    for row in rows:
        account_id = row.get("account_id") or row.get("account") or row.get("loginid")
        if account_id:
            refreshed[str(account_id)] = row
    for account in user.get("accounts", []):
        current = refreshed.get(str(account.get("account")))
        if current is not None and current.get("balance") is not None:
            account["balance"] = current["balance"]
            if current.get("currency"):
                account["currency"] = str(current["currency"]).upper()
    active = user.get("activeAccount") or {}
    active_refreshed = refreshed.get(str(active.get("account")))
    if active_refreshed is not None and active_refreshed.get("balance") is not None:
        active["balance"] = active_refreshed["balance"]
        if active_refreshed.get("currency"):
            active["currency"] = str(active_refreshed["currency"]).upper()
    user["activeAccount"] = active
    session["user"] = user
    session.modified = True


def _wallet_transfer_options(token, user):
    status, payload = _wallet_api_request("GET", "/wallets", token)
    if status != 200:
        return status, {"error": "wallet_lookup_failed", "detail": payload}
    wallets = []
    for wallet in _wallet_rows(payload):
        wallet_id = wallet.get("wallet_id") or wallet.get("id")
        currency = str(wallet.get("currency") or "").upper()
        if wallet_id and currency:
            wallets.append({
                "id": str(wallet_id),
                "kind": "wallet",
                "label": wallet.get("name") or f"Deriv Wallet ({currency})",
                "currency": currency,
                "balance": wallet.get("balance", 0),
            })
    accounts = [
        {
            "id": account_id,
            "kind": "platform",
            "label": f"Options account ({account.get('currency', '')})",
            "currency": str(account.get("currency") or "").upper(),
            "balance": account.get("balance", 0),
            "platform_name": "options",
        }
        for account_id, account in _real_session_accounts(user).items()
    ]
    return 200, {"sources": wallets + accounts, "destinations": wallets + accounts}


def _transfer_selection(token, user, source_id, destination_id):
    status, payload = _wallet_api_request("GET", "/wallets", token)
    if status != 200:
        return None, None, (status, {"error": "wallet_lookup_failed", "detail": payload})
    wallets = _wallet_rows(payload)
    accounts = _real_session_accounts(user)
    source = _wallet_record(wallets, source_id) or accounts.get(str(source_id))
    destination = _wallet_record(wallets, destination_id) or accounts.get(str(destination_id))
    if not source or not destination or source is destination:
        return None, None, (403, {"error": "account_not_owned_or_not_eligible"})
    return source, destination, None


def _transfer_amount(value):
    try:
        amount = Decimal(str(value).strip())
        if not amount.is_finite() or amount <= 0 or amount.as_tuple().exponent < -2:
            raise InvalidOperation
        return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None


def _transfer_error_message(status, payload):
    if status == 401:
        return "Your session has expired. Please sign in again."
    if status == 403:
        return "This account is not eligible for the requested transfer."
    if status == 429:
        return "Transfer rate limit reached. Please wait and try again."
    if status in {500, 503, 504}:
        return "The Deriv transfer service is temporarily unavailable. Please try again."
    detail = payload.get("detail") if isinstance(payload, dict) else None
    if isinstance(detail, dict):
        detail = detail.get("message") or detail.get("error")
    if isinstance(detail, str) and detail.strip():
        return detail.strip()
    if isinstance(payload, dict) and isinstance(payload.get("error"), str):
        return payload["error"]
    return "The transfer request was rejected."


def _transfer_payload(body, source, destination, amount, request_id):
    source_wallet_id = source.get("wallet_id") or source.get("id")
    destination_wallet_id = destination.get("wallet_id") or destination.get("id")
    source_is_wallet = bool(source_wallet_id)
    destination_is_wallet = bool(destination_wallet_id)
    if source_is_wallet and not destination_is_wallet:
        return {
            "wallet_id": str(source_wallet_id),
            "amount": format(amount, ".2f"),
            "currency": str(source.get("currency") or "").upper(),
            "direction": "from_wallet",
            "platform_name": "options",
            "platform_account_id": str(destination.get("account")),
            "request_id": request_id,
        }, "/transfers/platforms"
    if not source_is_wallet and destination_is_wallet:
        return {
            "wallet_id": str(destination_wallet_id),
            "amount": format(amount, ".2f"),
            "currency": str(source.get("currency") or "").upper(),
            "direction": "to_wallet",
            "platform_name": "options",
            "platform_account_id": str(source.get("account")),
            "request_id": request_id,
        }, "/transfers/platforms"
    if source_is_wallet and destination_is_wallet:
        return {
            "source_wallet_id": str(source_wallet_id),
            "destination_wallet_id": str(destination_wallet_id),
            "amount": format(amount, ".2f"),
            "currency": str(source.get("currency") or "").upper(),
            "request_id": request_id,
        }, "/transfers" if source.get("currency") == destination.get("currency") else "/transfers/exchange"
    return None, None


def _add_wallet_exchange_fields(payload, source, destination):
    source_currency = str(source.get("currency") or "").upper()
    destination_currency = str(destination.get("currency") or "").upper()
    if source_currency == destination_currency:
        return payload
    fields = {
        "wallet_currency": source.get("wallet_currency") or destination.get("wallet_currency"),
        "exchange_rate": source.get("exchange_rate") or destination.get("exchange_rate"),
        "rate_token": source.get("rate_token") or destination.get("rate_token"),
    }
    if not all(fields.values()):
        raise ValueError("Deriv did not provide a complete exchange-rate quote.")
    payload.update(fields)
    return payload


@app.route("/dashboard/api/transfers/options", methods=["GET"])
def dashboard_transfer_options():
    auth, error_response = _transfer_user()
    if error_response:
        return error_response
    user, token = auth
    status, payload = _wallet_transfer_options(token, user)
    return jsonify(payload), status


@app.route("/dashboard/api/transfers/validate", methods=["POST"])
def dashboard_transfer_validate():
    auth, error_response = _transfer_user()
    if error_response:
        return error_response
    user, token = auth
    body = request.get_json(silent=True) or {}
    amount = _transfer_amount(body.get("amount"))
    if not amount:
        return jsonify({"error": "Enter a valid amount greater than zero with no more than two decimal places."}), 400
    source, destination, selection_error = _transfer_selection(token, user, body.get("source_id"), body.get("destination_id"))
    if selection_error:
        status, payload = selection_error
        return jsonify(payload), status
    source_balance = Decimal(str(source.get("balance", 0)))
    if amount > source_balance:
        return jsonify({"error": "The amount exceeds the available source balance."}), 400
    payload, path = _transfer_payload(body, source, destination, amount, str(uuid.uuid4()))
    if not payload:
        return jsonify({"error": "The selected accounts cannot be used for transfers."}), 400
    try:
        _add_wallet_exchange_fields(payload, source, destination)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    status, response = _wallet_api_request("POST", "/transfers/validate", token, payload)
    if status >= 400:
        return jsonify({"error": _transfer_error_message(status, response), "detail": response}), status
    return jsonify({"validation": response, "source": source.get("currency"), "destination": destination.get("currency")})


@app.route("/dashboard/api/transfers", methods=["POST"])
def dashboard_transfer_execute():
    auth, error_response = _transfer_user()
    if error_response:
        return error_response
    user, token = auth
    body = request.get_json(silent=True) or {}
    amount = _transfer_amount(body.get("amount"))
    if not amount:
        return jsonify({"error": "Enter a valid amount greater than zero with no more than two decimal places."}), 400
    source, destination, selection_error = _transfer_selection(token, user, body.get("source_id"), body.get("destination_id"))
    if selection_error:
        status, payload = selection_error
        return jsonify(payload), status
    if amount > Decimal(str(source.get("balance", 0))):
        return jsonify({"error": "The amount exceeds the available source balance."}), 400
    payload, path = _transfer_payload(body, source, destination, amount, str(uuid.uuid4()))
    if not payload:
        return jsonify({"error": "The selected accounts cannot be used for transfers."}), 400
    try:
        _add_wallet_exchange_fields(payload, source, destination)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    # A fresh request_id is generated here, never reused from validation.
    status, response = _wallet_api_request("POST", path, token, payload)
    if status >= 400:
        return jsonify({"error": _transfer_error_message(status, response), "detail": response}), status
    _refresh_session_account_balances(user, token)
    user.setdefault("transfer_activity", []).insert(0, {
        "amount": format(amount, ".2f"),
        "currency": payload.get("currency"),
        "from": source.get("name") or source.get("account") or "Deriv Wallet",
        "to": destination.get("name") or destination.get("account") or "Deriv Wallet",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    user["transfer_activity"] = user["transfer_activity"][:10]
    session["user"] = user
    session.modified = True
    return jsonify({"success": True, "amount": format(amount, ".2f"), "currency": payload.get("currency"), "transfer": response})


@app.route("/api/exchange-rate", methods=["GET"])
def exchange_rate():
    """Expose the shared display-only USD/KES rate to the React client."""
    try:
        rate = _get_usd_kes_rate()
    except Exception:
        return jsonify({"error": "exchange_rate_unavailable"}), 503
    return jsonify({
        "base": "USD",
        "quote": "KES",
        "rate": rate,
        "fetchedAt": _EXCHANGE_RATE_CACHE["fetched_at"],
        "ttlSeconds": _EXCHANGE_RATE_CACHE_TTL,
    })


@app.route("/api/display-currency", methods=["GET", "POST"])
def display_currency():
    if request.method == "POST":
        value = str((request.get_json(silent=True) or {}).get("currency", "")).upper()
        if value not in {"USD", "KES"}:
            return jsonify({"error": "invalid_currency"}), 400
        session["display_currency"] = value
        session.modified = True
    return jsonify({"currency": session.get("display_currency"), "hasPreference": "display_currency" in session})


@app.route("/auth/balance", methods=["POST"])
def update_balance():
    user = session.get("user")
    if not user:
        return jsonify({"error": "unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    balance = data.get("balance")
    currency = data.get("currency")
    account = data.get("account")
    if balance is not None and account:
        try:
            balance = float(balance)
        except (TypeError, ValueError):
            balance = 0.0
        for acc in user.get("accounts", []):
            if acc["account"] == account:
                acc["balance"] = balance
                if currency:
                    acc["currency"] = currency
        if user.get("activeAccount") and user["activeAccount"]["account"] == account:
            user["activeAccount"]["balance"] = balance
            if currency:
                user["activeAccount"]["currency"] = currency
        session["user"] = user
        session.modified = True
    return jsonify({"success": True})


@app.route("/auth/otp-url", methods=["GET"])
def get_otp_url():
    """
    Generate a fresh OTP WebSocket URL for the active account.
    Called by the frontend just before opening the WS connection so the OTP
    token is guaranteed to be fresh (OTP tokens expire quickly).
    If the stored access token is expired, automatically tries to refresh it first.
    """
    user = session.get("user")
    if not user or not user.get("isAuthenticated"):
        return jsonify({"error": "unauthenticated"}), 401

    access_token = user.get("_accessToken", "")
    active = user.get("activeAccount") or {}
    account_id = active.get("account", "")

    if not account_id:
        return jsonify({"error": "no_account_id"}), 400

    # ── Auto-refresh the access token if it looks expired ─────────────────────
    token_expires_at = user.get("_tokenExpiresAt", "")
    token_expired = False
    if token_expires_at:
        try:
            expiry = datetime.fromisoformat(token_expires_at)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            token_expired = datetime.now(timezone.utc) >= expiry - timedelta(seconds=60)
        except Exception:
            pass

    if token_expired or not access_token:
        refresh_token = user.get("_refreshToken", "")
        if refresh_token:
            app.logger.info(
                f"[OTP-URL] token expired — attempting refresh for {account_id}"
            )
            try:
                td = _post_form(
                    DERIV_TOKEN_URL,
                    {
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token,
                        "client_id": DERIV_APP_ID,
                    },
                )
                new_token = td.get("access_token", "")
                new_refresh = td.get("refresh_token", refresh_token)
                new_expiry = int(td.get("expires_in", 3600))
                if new_token:
                    access_token = new_token
                    user["_accessToken"] = new_token
                    user["_refreshToken"] = new_refresh
                    user["_tokenExpiresAt"] = (
                        datetime.now(timezone.utc) + timedelta(seconds=new_expiry)
                    ).isoformat()
                    session["user"] = user
                    session.modified = True
                    app.logger.info(
                        f"[OTP-URL] token refreshed successfully for {account_id}"
                    )
            except Exception as exc:
                app.logger.warning(f"[OTP-URL] token refresh failed: {exc}")
        else:
            app.logger.warning(
                f"[OTP-URL] token expired and no refresh token for {account_id}"
            )

    if not access_token:
        return jsonify({"error": "no_access_token"}), 400

    otp_resp = _fetch_otp_ws_url(access_token, account_id)
    app.logger.info(
        f"[OTP-URL] raw otp_resp keys: {list(otp_resp.keys()) if otp_resp else 'empty'}"
    )

    if not otp_resp:
        return jsonify({"error": "otp_failed"}), 502

    payload = (
        otp_resp.get("data") if isinstance(otp_resp.get("data"), dict) else otp_resp
    )
    ws_url = (
        payload.get("url")
        or payload.get("wsUrl")
        or payload.get("ws_url")
        or otp_resp.get("url")
        or otp_resp.get("wsUrl")
        or otp_resp.get("ws_url")
    )
    otp_token = (
        payload.get("otp")
        or payload.get("token")
        or payload.get("access_token")
        or otp_resp.get("otp")
        or otp_resp.get("token")
    )

    if not ws_url and not otp_token:
        app.logger.warning(
            f"[OTP-URL] no url or token in response — "
            f"top keys: {list(otp_resp.keys())}, payload keys: {list(payload.keys())}"
        )
        return jsonify(
            {"error": "no_url_in_response", "debug": list(payload.keys())}
        ), 502

    # If we only got a bare OTP token (not a full URL), construct the WS URL
    if not ws_url and otp_token:
        ws_url = f"wss://ws.derivws.com/websockets/v3?app_id={DERIV_WS_APP_ID}&otp={otp_token}"
        app.logger.warning(
            f"[OTP-URL] constructed wsUrl from otp token for {account_id}"
        )

    app.logger.info(f"[OTP-URL] returning fresh wsUrl for {account_id}")
    return jsonify({"wsUrl": ws_url, "account": account_id})


@app.route("/auth/logout")
def logout_get():
    """
    GET-based logout — used by nav <a> links for reliable session clearing.
    Revokes tokens server-side, clears session, redirects home with no-cache headers.
    """
    user = session.get("user")
    if user:
        _try_revoke(user.get("_accessToken", ""))
        rt = user.get("_refreshToken")
        if rt:
            _try_revoke(rt)
    session.clear()
    resp = make_response(redirect("/"))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


@app.route("/auth/session", methods=["DELETE"])
def logout():
    """Legacy DELETE endpoint — kept for compatibility."""
    user = session.get("user")
    if user:
        _try_revoke(user.get("_accessToken", ""))
        rt = user.get("_refreshToken")
        if rt:
            _try_revoke(rt)
    session.clear()
    resp = jsonify({"success": True, "message": "Logged out"})
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


@app.route("/auth/switch/<account_id>")
def switch_account_get(account_id):
    """
    GET-based account switch — used by nav <a> links.
    Updates the active account in the session and redirects home with no-cache headers.
    """
    user = session.get("user")
    if not user:
        return redirect("/")
    accounts = user.get("accounts", [])
    target = next((a for a in accounts if a["account"] == account_id), None)
    if target:
        user["activeAccount"] = target
        user["_accessToken"] = target.get("token", user.get("_accessToken", ""))
        user.pop("transfer_activity", None)
        if user.get("_accessToken"):
            _refresh_session_account_balances(user, user["_accessToken"])
        session["user"] = user
        session.modified = True
    resp = make_response(redirect("/dashboard"))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


@app.route("/auth/switch-account", methods=["POST"])
def switch_account():
    """Legacy POST endpoint — kept for compatibility."""
    user = session.get("user")
    if not user:
        return jsonify({"error": "unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    account_id = data.get("accountId")
    accounts = user.get("accounts", [])
    target = next((a for a in accounts if a["account"] == account_id), None)
    if not target:
        return jsonify({"error": "not_found"}), 404
    user["activeAccount"] = target
    user["_accessToken"] = target.get("token", user.get("_accessToken", ""))
    user.pop("transfer_activity", None)
    if user.get("_accessToken"):
        _refresh_session_account_balances(user, user["_accessToken"])
    session["user"] = user
    session.modified = True
    resp = jsonify({"success": True, "activeAccount": target, "accounts": accounts})
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


# ─── Markets routes ───────────────────────────────────────────────────────────


@app.route("/markets", methods=["GET"])
def get_markets():
    return jsonify(load_markets())


@app.route("/markets/categories", methods=["GET"])
def get_market_categories():
    markets = load_markets()
    cats = [{"id": c["id"], "label": c["label"]} for c in markets["categories"]]
    return jsonify({"categories": cats})


@app.route("/markets/<category>", methods=["GET"])
def get_markets_by_category(category):
    markets = load_markets()
    found = next((c for c in markets["categories"] if c["id"] == category), None)
    if not found:
        return jsonify({"error": "Category not found"}), 404
    return jsonify({"category": found["id"], "instruments": found["instruments"]})


# ─── Trading routes ───────────────────────────────────────────────────────────


@app.route("/trade/place", methods=["POST"])
def place_trade():
    user = session.get("user")
    if not user or not user.get("isAuthenticated"):
        return jsonify(
            {"error": "unauthorized", "message": "Please log in to trade"}
        ), 401
    data = request.get_json(silent=True) or {}
    contract_type = data.get("contract_type")
    symbol = data.get("symbol", "1HZ100V")
    stake = data.get("stake", 10)
    display_currency = str(data.get("displayCurrency", "USD")).upper()
    duration = data.get("duration", 1)
    selection = data.get("selection")
    digit = data.get("digit")
    if not contract_type or not selection:
        return jsonify(
            {
                "error": "missing_fields",
                "message": "contract_type and selection are required",
            }
        ), 400
    try:
        stake_decimal = Decimal(str(stake))
        if display_currency == "KES":
            stake_decimal = (stake_decimal / Decimal(str(_get_usd_kes_rate()))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        elif display_currency != "USD":
            raise InvalidOperation
        stake = float(stake_decimal)
        duration = int(duration)
    except (ValueError, TypeError, InvalidOperation):
        return jsonify(
            {"error": "invalid_fields", "message": "Invalid stake or duration"}
        ), 400
    if stake < 0.35 or stake > 50000:
        return jsonify(
            {
                "error": "invalid_stake",
                "message": "Stake must be between 0.35 and 50000",
            }
        ), 400
    return jsonify(
        {
            "success": True,
            "trade": {
                "contract_type": contract_type,
                "symbol": symbol,
                "stake": stake,
                "selection": selection,
                "digit": digit,
                "status": "pending",
            },
        }
    )


# ─── Live market data (cached) ────────────────────────────────────────────────

_MARKET_CACHE: dict = {}
_CACHE_TTL = 60


def _http_get(url, timeout=8):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; AutonixBot/1.0)",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def _cache_get(key):
    item = _MARKET_CACHE.get(key)
    if item and time.time() - item[0] < _CACHE_TTL:
        return item[1]
    return None


def _cache_set(key, value):
    _MARKET_CACHE[key] = (time.time(), value)
    return value


def _fetch_forex():
    cached = _cache_get("forex")
    if cached is not None:
        return cached
    try:
        latest = json.loads(
            _http_get(
                "https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,CAD,CHF,CNY"
            )
        )
        d = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        prev = json.loads(
            _http_get(
                f"https://api.frankfurter.app/{d}?from=USD&to=EUR,GBP,JPY,AUD,CAD,CHF,CNY"
            )
        )
        rows = []
        for code, rate in latest["rates"].items():
            prev_rate = prev["rates"].get(code, rate)
            change = ((rate - prev_rate) / prev_rate) * 100 if prev_rate else 0
            high = max(rate, prev_rate) * 1.002
            low = min(rate, prev_rate) * 0.998
            rows.append(
                {
                    "pair": f"USD/{code}",
                    "price": round(rate, 4),
                    "change": round(change, 2),
                    "high": round(high, 4),
                    "low": round(low, 4),
                }
            )
        return _cache_set("forex", rows)
    except Exception:
        return _cache_set("forex", [])


def _fetch_crypto():
    cached = _cache_get("crypto")
    if cached is not None:
        return cached
    try:
        ids = "bitcoin,ethereum,ripple,litecoin,cardano,solana,dogecoin"
        data = json.loads(
            _http_get(
                f"https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids={ids}&order=market_cap_desc"
            )
        )
        rows = []
        for c in data:
            rows.append(
                {
                    "pair": (c["symbol"] or "").upper() + "/USD",
                    "price": c.get("current_price") or 0,
                    "change": round(c.get("price_change_percentage_24h") or 0, 2),
                    "high": c.get("high_24h") or 0,
                    "low": c.get("low_24h") or 0,
                }
            )
        return _cache_set("crypto", rows)
    except Exception:
        return _cache_set("crypto", [])


def _fetch_commodities():
    cached = _cache_get("commodities")
    if cached is not None:
        return cached
    symbols = [
        ("GC=F", "Gold/USD"),
        ("SI=F", "Silver/USD"),
        ("CL=F", "Crude Oil/USD"),
        ("NG=F", "Nat Gas/USD"),
        ("HG=F", "Copper/USD"),
        ("PL=F", "Platinum/USD"),
    ]
    rows = []
    for sym, label in symbols:
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=2d"
            data = json.loads(_http_get(url))
            meta = data["chart"]["result"][0]["meta"]
            price = meta.get("regularMarketPrice") or 0
            high = meta.get("regularMarketDayHigh") or price
            low = meta.get("regularMarketDayLow") or price
            prev = meta.get("chartPreviousClose") or price
            change = ((price - prev) / prev) * 100 if prev else 0
            rows.append(
                {
                    "pair": label,
                    "price": round(price, 3),
                    "change": round(change, 2),
                    "high": round(high, 3),
                    "low": round(low, 3),
                }
            )
        except Exception:
            continue
    return _cache_set("commodities", rows)


@app.route("/market-data/<category>", methods=["GET"])
def market_data(category):
    if category == "forex":
        return jsonify({"category": "forex", "items": _fetch_forex()})
    if category == "crypto":
        return jsonify({"category": "crypto", "items": _fetch_crypto()})
    if category == "commodities":
        return jsonify({"category": "commodities", "items": _fetch_commodities()})
    return jsonify({"error": "unknown_category"}), 404


@app.route("/market-pulse", methods=["GET"])
def market_pulse():
    forex = _fetch_forex()
    pulse = []
    for row in forex[:6]:
        pulse.append(
            {
                "pair": row["pair"],
                "rate": row["price"],
                "direction": "up" if row["change"] >= 0 else "down",
                "change": row["change"],
            }
        )
    return jsonify({"items": pulse})


@app.route("/dashboard/api/live-chart", methods=["GET"])
def dashboard_live_chart():
    """Return a verified active Deriv symbol for the dashboard chart."""
    instruments = [
        instrument
        for category in load_markets().get("categories", [])
        for instrument in category.get("instruments", [])
    ]
    symbol = next(
        (
            instrument
            for instrument in instruments
            if instrument.get("symbol") == "1HZ100V" and not instrument.get("isClosed")
        ),
        None,
    )
    if not symbol:
        return jsonify({"error": "requested_market_unavailable"}), 503
    return jsonify({
        "symbol": symbol["symbol"],
        "displayName": symbol["displayName"],
        "websocketUrl": f"wss://ws.derivws.com/websockets/v3?app_id={DERIV_WS_APP_ID}",
    })


# ─── Static file shortcuts ────────────────────────────────────────────────────


@app.route("/sw.js")
def service_worker():
    from flask import send_from_directory, make_response

    resp = make_response(send_from_directory(BASE_DIR / "static", "sw.js"))
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Content-Type"] = "application/javascript"
    return resp


@app.route("/manifest.webmanifest")
def manifest():
    from flask import send_from_directory

    return send_from_directory(
        BASE_DIR / "static",
        "manifest.webmanifest",
        mimetype="application/manifest+json",
    )

@app.route('/sitemap.xml')
def sitemap():
    return send_file('sitemap.xml')

@app.route('/robots.txt')
def robots():
    return send_file('robots.txt')

@app.route("/api/validate-activation", methods=["POST"])
def validate_activation():
    data = request.get_json(silent=True) or {}
    tier = (data.get("tier") or "").strip().lower()
    code = (data.get("code") or "").strip()
    if tier == "basic":
        valid_codes = [c.strip() for c in os.getenv("BASIC_BOT_CODES", "").split(",") if c.strip()]
    elif tier == "expert":
        valid_codes = [c.strip() for c in os.getenv("EXPERT_BOT_CODES", "").split(",") if c.strip()]
    else:
        return jsonify({"valid": False, "error": "Unknown tier"}), 400
    if code and code in valid_codes:
        return jsonify({"valid": True})
    return jsonify({"valid": False, "error": "Invalid activation code. Please check and try again."})


# ─── Debug endpoints (for testing auth flow) ──────────────────────────────────

@app.route("/api/auth-debug", methods=["GET"])
def auth_debug():
    """Debug endpoint to check Flask session and authentication state."""
    user = session.get("user")
    
    debug_info = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_exists": user is not None,
        "is_authenticated": user.get("isAuthenticated") if user else False,
        "session_keys": list(user.keys()) if user else [],
        "active_account": user.get("activeAccount", {}).get("account") if user else None,
        "num_accounts": len(user.get("accounts", [])) if user else 0,
    }
    
    app.logger.info(f"[Debug] Auth status: {debug_info}")
    return jsonify(debug_info)


@app.route("/api/auth-test", methods=["GET"])
def auth_test():
    """Simple endpoint to test if user is authenticated."""
    user = session.get("user")
    
    if not user:
        return jsonify({"authenticated": False, "message": "No session found"}), 401
    
    if not user.get("isAuthenticated"):
        return jsonify({"authenticated": False, "message": "Session exists but not authenticated"}), 401
    
    return jsonify({
        "authenticated": True,
        "account": user.get("activeAccount", {}).get("account"),
        "currency": user.get("activeAccount", {}).get("currency"),
    })

# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV", "production") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
