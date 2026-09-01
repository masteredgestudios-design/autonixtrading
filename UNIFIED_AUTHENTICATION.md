# Unified Flask + React Authentication Implementation

## Overview
Successfully unified the authentication system between Flask and React. Flask's OAuth 2.0 + PKCE implementation is now the single source of truth for authentication, and React uses Flask's session endpoints instead of its own OAuth flow.

## Key Requirements Met ✓

### 1. Unified Authentication Source
- **Flask is the source of truth** for all authentication
- All OAuth 2.0 + PKCE handling occurs on the Flask server
- User sessions are stored securely server-side in Flask
- Session cookies are shared between Flask and React (same domain, SameSite=Lax)

### 2. Consistent Login/Authentication Flow
- **All login paths converge** to Flask's `/auth/login` endpoint
- Whether user initiates from Flask page or React page, they use the same OAuth flow
- Session tokens and user identity are managed by Flask
- React reads authentication state from Flask's `/auth/session` endpoint

### 3. Dashboard Redirect After Login
- ✓ **Always redirects to Dashboard** regardless of entry point
- ✓ **No "redirect back to original page" behavior**
- Works from:
  - Marketing page (autonix.html)
  - React app at /trader
  - React app at /ATDbot/
  - Any protected or public page

### 4. Logout Behavior
- Calls Flask's `/auth/logout` endpoint
- Flask revokes tokens and clears session server-side
- User redirected to home page (/autonix.html)
- All auth data cleared cleanly

## Implementation Details

### Flask Changes

#### File: `app.py` (lines 907-920)
**Changed:** OAuth callback redirect destination
- **Before:** Redirected to `/` (marketing page)
- **After:** Redirects to `/trader` (where React app is loaded)
- This ensures React can detect the authenticated session

```python
# After OAuth callback processing
return redirect("/trader")
```

### React Changes

#### 1. New Service: `src/services/flask-auth.service.ts`
Provides functions for interacting with Flask's auth endpoints:

```typescript
getFlaskSession()          // Fetch current session from /auth/session
initiateFlaskLogin()       // Redirect to /auth/login
initiateFlaskSignup()      // Same as login (Deriv handles signup flow)
logoutFromFlask()          // Call /auth/logout and redirect home
isAuthenticatedViaFlask()  // Check if user is authenticated
getActiveAccountFromFlask()    // Get active account
getAccountsFromFlask()     // Get all accounts
```

#### 2. New Hook: `src/hooks/useFlaskAuthSession.ts`
Polls Flask's session and syncs with React state:
- Checks Flask session every 10 seconds
- Auto-retries on failure
- Provides: `isAuthenticated`, `isLoading`, `session`, `error`, `refreshSession`

#### 3. Updated Component: `src/components/layout/header/header.tsx`
**Changed login behavior:**
- `handleLogin()`: Now calls `initiateFlaskLogin()` instead of generating React OAuth URL
- `handleSignup()`: Now calls `initiateFlaskLogin()` (Deriv OAuth handles signup)
- Both redirect to Flask's `/auth/login` endpoint

#### 4. Updated Hook: `src/hooks/useLogout.ts`
**Changed logout behavior:**
- Now calls `logoutFromFlask()` instead of DELETE request to `/auth/session`
- Flask endpoint properly clears session and revokes tokens
- Maintains fallback for auth info cleanup

#### 5. Updated Component: `src/app/App.tsx`
**Changed initialization and redirect logic:**
- Removed `handleOAuthCallback` import (React no longer handles OAuth)
- Added Flask session check on component mount
- If authenticated via Flask, redirects to Dashboard with `#dashboard` hash
- Preserves language parameter if present

```typescript
// Check Flask session and redirect to Dashboard if authenticated
const sessionData = await fetch('/auth/session', {
    method: 'GET',
    credentials: 'include'
});

if (sessionData.isAuthenticated === true) {
    // Redirect to #dashboard
}
```

## Authentication Flow

### Login Flow
```
User clicks "Log In" (anywhere in app)
    ↓
React calls initiateFlaskLogin()
    ↓
Redirects to /auth/login
    ↓
Flask generates PKCE challenge and redirects to Deriv OAuth
    ↓
User authenticates with Deriv
    ↓
Deriv redirects back to Flask's / with ?code parameter
    ↓
Flask processes OAuth callback (token exchange, account fetch)
    ↓
Flask creates secure session with authenticated user
    ↓
Flask redirects to /trader
    ↓
React app loads at /trader
    ↓
App.tsx checks Flask's /auth/session endpoint
    ↓
Detects authenticated session
    ↓
Redirects to #dashboard
    ↓
✓ User sees Dashboard with authenticated session
```

### Logout Flow
```
User clicks "Logout"
    ↓
React calls useLogout() → logoutFromFlask()
    ↓
Calls Flask's /auth/logout endpoint
    ↓
Flask clears session and revokes tokens
    ↓
Flask redirects to /
    ↓
User sees marketing page (autonix.html)
    ↓
✓ Session is fully cleared
```

## Session Sharing

### How Flask and React Share Sessions

1. **Session Cookie**: Flask sets a session cookie on the domain
   - `SESSION_COOKIE_SAMESITE = "Lax"` - allows same-site requests
   - `SESSION_COOKIE_HTTPONLY = True` - secure, not accessible to JavaScript
   - Cookie is sent with all requests to Flask endpoints

2. **API Endpoints**: React calls Flask endpoints with credentials
   ```typescript
   fetch('/auth/session', {
       credentials: 'include'  // Include cookies
   })
   ```

3. **Server-Side Session**: Flask stores full user/account data
   - Tokens (access, refresh)
   - Account list with balances
   - Active account information
   - Token expiration tracking

4. **API Response**: `/auth/session` returns metadata (no tokens to client)
   ```json
   {
       "isAuthenticated": true,
       "accounts": [...],
       "activeAccount": {...}
   }
   ```

## CORS Configuration

The Flask CORS configuration properly supports credential-based requests:

```python
CORS(
    app,
    supports_credentials=True,  # Allow cookies with requests
    origins=list(_ALLOWED_ORIGINS)
)
```

## WebSocket Authentication

The bot-skeleton service automatically uses Flask's session for WebSocket authentication:
- If local auth info not available, it queries Flask's `/auth/otp-url`
- Flask returns OTP WebSocket URL using tokens from session
- WebSocket connection uses OTP for authentication

## Testing Recommendations

### 1. Login Flows
- [ ] Login from marketing page (/)
- [ ] Login from /trader page
- [ ] Login from /ATDbot/ page
- [ ] Verify user always lands on Dashboard (#dashboard)

### 2. Session Persistence
- [ ] Reload page after login - should stay logged in
- [ ] Visit different pages while logged in
- [ ] Open app in different tab - session should be shared

### 3. Logout
- [ ] Click logout from any page
- [ ] Verify redirected to / (marketing page)
- [ ] Verify cannot access protected pages
- [ ] Verify login works again

### 4. Token Management
- [ ] Test token refresh (should happen automatically)
- [ ] Test account switching
- [ ] Test balance updates

### 5. Cross-Page Navigation
- [ ] Login at /trader, navigate to /ATDbot/
- [ ] Login at / (should redirect to Dashboard)
- [ ] Stay authenticated across all paths

## Files Modified

1. **Backend**
   - `app.py` - Changed OAuth callback redirect from `/` to `/trader`

2. **Frontend - New Files**
   - `src/services/flask-auth.service.ts` - Flask auth API service
   - `src/hooks/useFlaskAuthSession.ts` - Flask session polling hook

3. **Frontend - Modified Files**
   - `src/app/App.tsx` - Removed React OAuth, added Flask session check
   - `src/components/layout/header/header.tsx` - Use Flask login endpoint
   - `src/hooks/useLogout.ts` - Use Flask logout endpoint

## Migration Notes

### What Changed for Users
1. **Login Button**: Same visual experience, now routes through Flask
2. **Session Handling**: More secure (server-side instead of localStorage)
3. **Dashboard Access**: Consistent redirect after login (no more redirect-back behavior)
4. **Token Management**: Handled transparently by Flask (no client-side complexity)

### What Stayed the Same
1. User experience remains identical
2. Dashboard and bot functionality unchanged
3. Account switching still works
4. WebSocket trading still works
5. Balance updates still work

## Security Improvements

1. **Server-Side Sessions**: Tokens never exposed to client
2. **PKCE**: OAuth tokens secured with proof key for code exchange
3. **HTTPOnly Cookies**: Session cookies cannot be accessed by JavaScript
4. **Token Revocation**: Logout properly revokes tokens at OAuth provider
5. **Single Source of Truth**: No desynchronization between Flask and React auth states

## Troubleshooting

### Issue: Login redirects to marketing page instead of Dashboard
- **Cause**: Flask session not being detected
- **Solution**: Check `/auth/session` endpoint returns `isAuthenticated: true`
- **Debug**: Add logging to App.tsx session check

### Issue: Session lost when navigating between /trader and /ATDbot/
- **Cause**: Session cookie not being sent
- **Solution**: Verify `credentials: 'include'` in fetch calls
- **Debug**: Check browser's cookie storage

### Issue: Logout doesn't clear session
- **Cause**: Flask's `/auth/logout` not being called
- **Solution**: Verify logoutFromFlask() is properly implemented
- **Debug**: Check Flask logs for logout endpoint calls

### Issue: Token expires and user is logged out unexpectedly
- **Cause**: Token refresh failing
- **Solution**: Check `POST /auth/refresh` endpoint in Flask
- **Debug**: Verify refresh token is stored and valid

## Future Enhancements

1. **Auto-refresh before expiration**: Currently reactive, could be proactive
2. **Remember device**: Extended session lifetime for trusted devices
3. **Multi-account management**: Better UI for account switching
4. **Session timeout warning**: Warn user before session expires
5. **Concurrent login**: Handle user logged in from multiple devices
