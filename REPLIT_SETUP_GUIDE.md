# Replit Setup Instructions

## 📋 Prompt to Include When Importing to Replit

**Copy and paste this when asked about your project:**

```
This is a Flask + React full-stack application.

Setup Instructions:
1. Install Python packages: pip install -r requirements.txt gunicorn
2. Install Node packages: npm install --legacy-peer-deps
3. Build React app: npm run build
4. Run Flask server: python app.py

The Flask server (running from app.py) will:
- Serve the built React app from the /dist folder
- Provide all API endpoints
- Listen on port 5000
- Handle both frontend and backend from a single entry point

No changes needed - everything is pre-configured. Just import and run!

AFTER SETUP:
When the "Run" completes (2-3 minutes):
1. Click the "Preview" button in the top-right corner of Replit
2. Open in a new tab to see your app running live
3. Share the preview URL to verify everything is working correctly
```

---

## Quick Start

1. **Import to Replit**: Import this repository from GitHub to Replit
2. **Run**: Click the "Run" button in Replit (or press `Ctrl+Enter`)
3. **Access**: Your app will be available at the Replit URL

---

## What Happens Automatically

When you click "Run" or start the Replit environment:

1. **Install Python dependencies** from `requirements.txt`
2. **Install Node/npm dependencies** from `package.json`
3. **Build the React app** using `npm run build` → outputs to `/dist`
4. **Start Flask server** that serves both the API and React frontend from `app.py`

The Flask server automatically:
- Serves the React app built files from the `/dist` folder
- Runs on port 5000
- Serves API endpoints for the bot functionality
- Handles CORS properly for production

---

## No Changes Needed

✅ **This is ready to go!** No modifications are required:
- All environment variables are pre-configured in `.replit`
- Python and Node dependencies are defined
- Build process is automated
- Flask is configured to serve the React app

---

## Environment Variables

If you need to customize behavior, you can add Replit Secrets:

- `SESSION_SECRET`: Session encryption key (auto-generated if not set)
- `REDIRECT_URL`: OAuth redirect URL
- `CORS_ORIGIN`: CORS origin URL
- `FLASK_ENV`: Set to "production" or "development"

---

## Troubleshooting

**If the build fails:**
- Check that both Python 3.11+ and Node 20+ are selected in Replit
- Make sure the project has read the `.replit` and `replit.nix` files

**If port 5000 is busy:**
- Replit will automatically assign an available port
- The URL will show the correct port to use

**If npm install fails:**
- This uses `--legacy-peer-deps` to handle peer dependency conflicts
- This is normal for large TypeScript projects

---

## Project Structure

```
app.py                 # Flask backend (serves everything)
dist/                  # Built React app (created by npm run build)
package.json          # React/TypeScript dependencies
requirements.txt      # Python dependencies
.replit              # Replit configuration
replit.nix           # Nix environment configuration
```

---

## How It Works

1. **Frontend (React)**: Built with rsbuild, compiled to static files in `/dist`
2. **Backend (Flask)**: Serves the React app + provides API endpoints
3. **Single Entry Point**: `app.py` runs everything through Flask

When you access the Replit URL:
- Flask serves the `dist/index.html` (React app)
- React app communicates with Flask API at the same domain
- No CORS issues because they're on the same server

---

## Preview Your App

After clicking "Run":

1. **Wait for setup** (~2-3 minutes for dependencies)
2. **Look for the "Preview" button** in Replit's top-right corner
3. **Click "Open in new tab"** to see your app running live
4. **Test the bot interface** - if it loads, everything is working!

The preview URL will look like: `https://[project-name].replit.dev`

---

## Ready to Deploy! 🚀

Just import and run. Click the Preview button to see your app live!
