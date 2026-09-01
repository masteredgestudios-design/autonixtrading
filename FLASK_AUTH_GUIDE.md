# Flask Authentication System - Testing & Debugging Guide

## Overview

The Flask app now has a complete authentication system using Deriv OAuth 2.0 + PKCE. After login, users are **always redirected to `/dashboard`**.

## Flask Auth Flow

```
1. User clicks "Login" on the Flask app
   ↓
2. Redirects to /auth/login
   ↓
3. Flask generates PKCE challenge + state and redirects to Deriv OAuth
   ↓
4. User authenticates with Deriv
   ↓
5. Deriv redirects back to / with ?code parameter
   ↓
6. Flask processes callback in _handle_oauth_callback():
   - Verifies PKCE state
   - Exchanges code for access_token
   - Fetches user accounts
   - Creates Flask session
   ↓
7. Flask redirects to /dashboard
   ↓
8. User sees Dashboard with authenticated session
```

## Key Flask Routes

### `/auth/login`
- **What it does:** Initiates OAuth flow with Deriv
- **Redirects to:** Deriv OAuth URL (auth.deriv.com)
- **PKCE:** Enabled (verifier in signed state)

### `/` (Home / OAuth Callback Target)
- **What it does:** Serves marketing page OR processes OAuth callback
- **How it decides:**
  - If `?code=...` in URL → call `_handle_oauth_callback()`
  - If `?acct1=...` in URL → call `_handle_legacy_callback()`
  - Otherwise → serve `autonix.html` (marketing page)

### `/_handle_oauth_callback()` (Called by `/`)
- **What it does:**
  1. Verifies PKCE state
  2. Exchanges auth code for tokens
  3. Fetches user accounts
  4. Creates Flask session with `_build_accounts_session()`
  5. **Redirects to `/dashboard`**

### `/dashboard`
- **What it does:** Serves Dashboard template
- **Session check:** Shows dashboard only if `session_data.isAuthenticated == True`
- **Fallback:** Shows login prompt if not authenticated

### `/auth/logout`
- **What it does:**
  1. Revokes access_token and refresh_token
  2. Clears Flask session
  3. Redirects to `/` (marketing page)

## Testing the Flask Auth

### Step 1: Check Environment Variables

Make sure these are set in `.env` or `.env.production`:

```bash
# Required
DERIV_APP_ID=your_oauth_client_id_here
REDIRECT_URL=http://localhost:5000  # Must match registered URI in Deriv

# Optional but recommended
SESSION_SECRET=your_secret_key_here
DERIV_LEGACY_APP_ID=your_numeric_app_id  # For fallback to legacy flow
```

### Step 2: Start Flask App

```bash
python app.py
```

You should see:
```
 * Running on http://0.0.0.0:5000
 * Debug mode: on/off
 [INFO] [OAuth] Session created successfully
```

### Step 3: Test Login Flow

**In Browser:**

1. Go to `http://localhost:5000/`
   - Should see marketing page (autonix.html)

2. Click "Join Deriv for Free" or use login button
   - Should redirect to `auth.deriv.com`
   - Deriv login screen appears

3. Log in with Deriv test account (or create one)
   - Deriv asks for permission
   - Should redirect back to your app with `?code=...`

4. Flask processes callback
   - Check browser console/network tab
   - Should see redirect to `http://localhost:5000/dashboard`

5. Dashboard should load with:
   - Account info showing (e.g., "Welcome back — VRT...")
   - Live connection indicator
   - Balance displayed

**Expected in Flask logs:**

```
[INFO] [OAuth] Processing callback...
[INFO] [OAuth] Received code: xxx...
[INFO] [OAuth] PKCE verifier recovered from signed state
[INFO] [OAuth] Token exchange successful
[INFO] [OAuth] Built 1 account(s)
[INFO] [OAuth] Session created successfully
[INFO] [OAuth] Redirecting to /dashboard after successful login
```

### Step 4: Verify Session with Debug Endpoints

#### Check Session Status

```bash
curl http://localhost:5000/api/auth-debug
```

Expected response (after login):
```json
{
  "timestamp": "2026-09-01T10:30:45.123456+00:00",
  "session_exists": true,
  "is_authenticated": true,
  "session_keys": ["isAuthenticated", "activeAccount", "accounts", "_accessToken", "_refreshToken", "_tokenExpiresAt"],
  "active_account": "VRT123456",
  "num_accounts": 1
}
```

#### Quick Auth Test

```bash
curl http://localhost:5000/api/auth-test
```

Expected response (after login):
```json
{
  "authenticated": true,
  "account": "VRT123456",
  "currency": "USD"
}
```

### Step 5: Test Logout

1. In Dashboard, click "Logout"
   - Should redirect to `/` (marketing page)

2. Verify session is cleared:
   ```bash
   curl http://localhost:5000/api/auth-debug
   ```
   
   Expected response:
   ```json
   {
     "session_exists": false,
     "is_authenticated": false,
     "session_keys": []
   }
   ```

3. Try to access `/dashboard` directly
   - Should show login prompt (not dashboard content)

## Common Issues & Fixes

### Issue 1: "No authorization code received"

**Symptom:** Login form appears, but after Deriv login, get error instead of dashboard.

**Causes:**
- REDIRECT_URL not matching registered URI in Deriv app settings
- Deriv app not properly configured
- Browser blocked the redirect

**Fix:**
1. Check `REDIRECT_URL` in your `.env`
   ```bash
   REDIRECT_URL=http://localhost:5000
   # Must match EXACTLY what you registered in Deriv app settings
   ```
   
2. Verify Deriv app is registered:
   - Go to https://app.deriv.com/account/api-token
   - Or contact Deriv support

3. Check Flask logs:
   ```bash
   # Look for error lines in logs
   grep "ERROR" logs.txt
   ```

### Issue 2: "PKCE verifier mismatch"

**Symptom:** Login fails with "Login session expired or invalid"

**Causes:**
- Session cookie lost during redirect
- Tampered state parameter

**Fix:**
1. Verify `SESSION_SECRET` is set
   ```bash
   SESSION_SECRET=your_secret_key_here
   ```

2. Check Flask session cookie settings (should be automatic)

3. Restart Flask app:
   ```bash
   pkill -f "python app.py"
   python app.py
   ```

### Issue 3: "No access_token in response"

**Symptom:** OAuth callback succeeds but session not created

**Causes:**
- Token exchange failed silently
- Deriv OAuth service error
- DERIV_APP_ID incorrect

**Fix:**
1. Check DERIV_APP_ID is correct (should be alphanumeric string, not numeric)
   ```bash
   echo $DERIV_APP_ID
   # Should look like: "34567890abcdef"
   ```

2. Check Flask logs for detailed error:
   ```bash
   grep "token_data" logs.txt
   ```

3. Try switching to legacy OAuth:
   - Set `DERIV_LEGACY_APP_ID` to numeric app ID
   - This may work better if new OAuth has issues

### Issue 4: Dashboard shows "Not Authenticated"

**Symptom:** Redirected to dashboard, but see login prompt instead

**Causes:**
- Session not persisted properly
- SESSION_SECRET not set or changed
- Cookie not being sent

**Fix:**
1. Check session with debug endpoint:
   ```bash
   curl http://localhost:5000/api/auth-debug
   ```
   
   If `"session_exists": false`, session was lost.

2. Make sure SESSION_SECRET is persistent:
   ```bash
   # .env file
   SESSION_SECRET=your_permanent_secret_key_here
   ```
   
   (Without this, sessions are lost on app restart)

3. Check browser cookies:
   - Open DevTools → Application → Cookies
   - Look for `session` cookie
   - Should have value, not empty

### Issue 5: Can't access dashboard after login

**Symptom:** Redirects to dashboard but page doesn't load

**Causes:**
- templates/dashboard.html missing
- Template rendering error
- Session data not passed to template

**Fix:**
1. Check if dashboard template exists:
   ```bash
   ls -la templates/dashboard.html
   ```

2. Check Flask logs for template errors:
   ```bash
   grep "render_template" logs.txt
   ```

3. Verify session data is being sent:
   ```bash
   curl -H "Cookie: session=your_session_id" http://localhost:5000/api/auth-debug
   ```

## Session Data Structure

When user is logged in, Flask session contains:

```python
{
    "user": {
        "isAuthenticated": True,
        "activeAccount": {
            "account": "VRT123456",
            "token": "",  # Empty in _safe_for_template (stripped for security)
            "currency": "USD",
            "isVirtual": True,
            "accountType": "virtual",
            "balance": 10000.00
        },
        "accounts": [
            # ... list of all user's accounts
        ],
        # Private keys (not sent to browser):
        "_accessToken": "access_token_string",
        "_refreshToken": "refresh_token_string", 
        "_tokenExpiresAt": "2026-09-01T18:30:45.123456+00:00"
    }
}
```

## Testing Checklist

- [ ] Flask app starts without errors
- [ ] Marketing page loads at `/`
- [ ] Login button exists and clickable
- [ ] Clicking login redirects to Deriv
- [ ] Can log in with Deriv account
- [ ] After login, redirects to `/dashboard`
- [ ] Dashboard shows account info
- [ ] `/api/auth-debug` shows `is_authenticated: true`
- [ ] Logout button appears on dashboard
- [ ] Clicking logout clears session
- [ ] After logout, session is gone
- [ ] Can log in again (session cleared properly)
- [ ] Reloading dashboard while logged in keeps session
- [ ] Accessing `/dashboard` without login shows login prompt

## Next Steps: React Integration

Once Flask auth is working:

1. React needs to check Flask's `/auth/session` endpoint
2. React calls Flask's `/auth/login` for login (not its own OAuth)
3. React calls Flask's `/auth/logout` for logout
4. React displays Dashboard based on Flask session

See `UNIFIED_AUTHENTICATION.md` for React integration guide.

## Debug Helpers

### View Flask logs

If running in terminal:
```bash
# Logs appear in terminal
tail -f flask_logs.txt
```

### Enable verbose Flask logging

Add to app.py:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
app.logger.setLevel(logging.DEBUG)
```

### Test session persistence

```bash
# Start session
curl -c cookies.txt http://localhost:5000/auth/login

# Check if session exists
curl -b cookies.txt http://localhost:5000/api/auth-debug

# Logout
curl -b cookies.txt http://localhost:5000/auth/logout

# Verify session cleared
curl -b cookies.txt http://localhost:5000/api/auth-debug
```

### Check environment in running app

Add this endpoint to see what config Flask has:

```python
@app.route("/api/config-debug")
def config_debug():
    return jsonify({
        "DERIV_APP_ID": DERIV_APP_ID[:10] + "..." if DERIV_APP_ID else None,
        "REDIRECT_URL": REDIRECT_URL,
        "SESSION_COOKIE_SAMESITE": app.config.get("SESSION_COOKIE_SAMESITE"),
        "SESSION_COOKIE_SECURE": app.config.get("SESSION_COOKIE_SECURE"),
        "SESSION_COOKIE_HTTPONLY": app.config.get("SESSION_COOKIE_HTTPONLY"),
    })
```

Then:
```bash
curl http://localhost:5000/api/config-debug
```
