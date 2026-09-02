"""
OAuth 2.0 + PKCE Callback Handler

Handles the OAuth callback from Deriv after the user authenticates.
Processes the authorization code, exchanges it for tokens, and creates a Flask session.

This module keeps auth logic separate from the main app.py for clarity and maintainability.
"""

import logging
import secrets
import urllib.parse
import urllib.error
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple
from flask import session, redirect, jsonify

logger = logging.getLogger(__name__)


def handle_oauth_callback(
    request_args: Dict[str, Any],
    session_data: Dict[str, Any],
    deriv_config: Dict[str, str],
    post_form_func,
    decode_jwt_func,
    fetch_rest_accounts_func,
    fetch_otp_ws_url_func,
    fetch_userinfo_func,
    build_accounts_session_func,
) -> Tuple[Optional[str], int]:
    """
    Handle OAuth callback from Deriv.
    
    Args:
        request_args: URL query parameters from the callback request
        session_data: Flask session object
        deriv_config: Dictionary with DERIV_APP_ID, DERIV_TOKEN_URL, etc.
        post_form_func: Function to POST form data
        decode_jwt_func: Function to decode JWT payload
        fetch_rest_accounts_func: Function to fetch accounts via REST
        fetch_otp_ws_url_func: Function to fetch OTP WebSocket URL
        fetch_userinfo_func: Function to fetch userinfo
        build_accounts_session_func: Function to build and store session
    
    Returns:
        (redirect_url, status_code) tuple
        - redirect_url: Where to redirect user (e.g., "/dashboard")
        - status_code: HTTP status code
    """
    
    # Check for OAuth errors
    error = request_args.get("error")
    if error:
        logger.warning(f"[OAuth] Deriv returned error: {error}")
        session.pop("pkce_nonce", None)
        session.pop("pkce_verifier", None)
        session.pop("pkce_redirect", None)
        return None, 400  # Will be rendered as error page
    
    # Extract OAuth callback parameters
    returned_state = request_args.get("state", "")
    code = request_args.get("code", "")
    redirect_uri = session_data.pop("pkce_redirect", deriv_config.get("redirect_uri", ""))
    
    logger.info("[OAuth] Processing callback...")
    logger.info(f"[OAuth] Received code: {code[:10]}..." if code else "[OAuth] No code received")
    
    # ── Verify and extract PKCE verifier from state ─────────────────────────
    from app import _pkce_state_decode
    
    decoded = _pkce_state_decode(returned_state)
    if decoded:
        state_nonce, code_verifier = decoded
        stored_nonce = session_data.pop("pkce_nonce", None)
        if not stored_nonce or not secrets.compare_digest(state_nonce, stored_nonce):
            logger.warning("[OAuth] Nonce mismatch - possible CSRF attack")
            return None, 400
        logger.info("[OAuth] PKCE verifier recovered from signed state")
    else:
        # Fallback for legacy session-stored verifier
        code_verifier = session_data.pop("pkce_verifier", None)
        stored_state = session_data.pop("pkce_nonce", None) or session_data.pop("pkce_state", None)
        if stored_state and not secrets.compare_digest(returned_state, stored_state):
            logger.warning("[OAuth] State mismatch - possible CSRF attack")
            return None, 400
        if code_verifier:
            logger.info("[OAuth] Verifier recovered from session (legacy)")
        else:
            logger.warning("[OAuth] No verifier found - PKCE will fail")
    
    if not code:
        logger.error("[OAuth] No authorization code received")
        return None, 400
    
    # ── Exchange authorization code for tokens ────────────────────────────
    logger.info("[OAuth] Exchanging code for tokens...")
    
    exchange_payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": deriv_config.get("DERIV_APP_ID"),
        "redirect_uri": redirect_uri,
    }
    if code_verifier:
        exchange_payload["code_verifier"] = code_verifier
    
    try:
        token_data = post_form_func(deriv_config.get("DERIV_TOKEN_URL"), exchange_payload)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        logger.error(f"[OAuth] Token exchange HTTP error: {e.code} - {body}")
        return None, 502
    except Exception as e:
        logger.error(f"[OAuth] Token exchange failed: {e}")
        return None, 502
    
    logger.info(f"[OAuth] Token exchange keys: {sorted(token_data.keys())}")
    
    # ── Extract tokens ───────────────────────────────────────────────────
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    
    if not access_token:
        logger.error(f"[OAuth] No access_token in response")
        return None, 502
    
    logger.info("[OAuth] Token exchange successful")
    
    # ── Build accounts list from token response ───────────────────────────
    accounts = _build_accounts_from_token_response(
        token_data,
        access_token,
        decode_jwt_func,
        fetch_rest_accounts_func,
        fetch_otp_ws_url_func,
        fetch_userinfo_func,
    )
    
    if not accounts:
        logger.error("[OAuth] Failed to build accounts list")
        return None, 502
    
    logger.info(f"[OAuth] Built {len(accounts)} account(s)")
    
    # ── Create Flask session ──────────────────────────────────────────────
    try:
        build_accounts_session_func(accounts, access_token, refresh_token, expires_in)
        logger.info("[OAuth] Session created successfully")
    except Exception as e:
        logger.error(f"[OAuth] Failed to create session: {e}")
        return None, 502
    
    # ── Success: redirect to Dashboard ────────────────────────────────────
    logger.info("[OAuth] Redirecting to /dashboard")
    return "/dashboard", 302


def _build_accounts_from_token_response(
    token_data: Dict[str, Any],
    access_token: str,
    decode_jwt_func,
    fetch_rest_accounts_func,
    fetch_otp_ws_url_func,
    fetch_userinfo_func,
) -> List[Dict[str, Any]]:
    """Build accounts list from various sources in token response."""
    
    # Try to get accounts from token response
    raw_accounts = (
        token_data.get("accounts")
        or token_data.get("account_list")
        or token_data.get("acct_list")
        or []
    )
    logger.info(f"[Accounts] Raw accounts from exchange: {len(raw_accounts)}")
    
    # Try JWT payload if no accounts in response
    if not raw_accounts:
        for jwt_candidate in filter(None, [token_data.get("id_token"), access_token if "." in access_token else None]):
            payload = decode_jwt_func(jwt_candidate)
            jwt_accts = payload.get("accounts") or payload.get("account_list") or []
            if jwt_accts:
                logger.info(f"[Accounts] Found {len(jwt_accts)} in JWT payload")
                raw_accounts = jwt_accts
                break
    
    # Try userinfo endpoint if still no accounts
    if not raw_accounts:
        userinfo = fetch_userinfo_func(access_token)
        ui_accts = userinfo.get("accounts") or userinfo.get("account_list") or []
        if ui_accts:
            logger.info(f"[Accounts] Found {len(ui_accts)} from userinfo endpoint")
            raw_accounts = ui_accts
    
    # Build account objects
    accounts = []
    if raw_accounts:
        from app import _is_api_token
        
        for a in raw_accounts:
            account_id = a.get("loginid") or a.get("account", "")
            is_virtual = str(account_id).upper().startswith(("VRTC", "VRW", "DTML", "DOT"))
            token = a.get("token") or a.get("api_token") or access_token
            
            accounts.append({
                "account": account_id,
                "token": token,
                "currency": (a.get("currency") or "USD").upper(),
                "isVirtual": is_virtual,
                "accountType": "virtual" if is_virtual else "real",
                "balance": float(a.get("balance") or 0),
            })
    else:
        # Fallback: single account from JWT
        from app import _is_api_token
        
        jwt_payload = decode_jwt_func(access_token)
        account_id = jwt_payload.get("loginid") or jwt_payload.get("sub") or ""
        if account_id:
            is_virtual = str(account_id).upper().startswith(("VRTC", "VRW", "DOT"))
            accounts = [{
                "account": account_id,
                "token": access_token,
                "currency": jwt_payload.get("currency", "USD").upper(),
                "isVirtual": is_virtual,
                "accountType": "virtual" if is_virtual else "real",
                "balance": 0,
            }]
    
    return accounts
