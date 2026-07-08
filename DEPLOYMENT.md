# FreightLink Africa - Render Deployment Guide

Complete step-by-step guide to deploy FreightLink Africa to Render.

---

## Prerequisites

Before starting, ensure you have:

1. **GitHub Account** - To host your code
2. **Render Account** - Sign up at [render.com](https://render.com) (free tier available)
3. **Supabase Account** - Already provisioned for this project
4. **Google Cloud Account** - For OAuth and Gemini AI
5. **Paynow Account** - For payment processing (optional for initial testing)

---

## Step 1: Prepare Your Supabase Database

Your Supabase project is already provisioned:

| Setting | Value |
|---------|-------|
| **Project URL** | `https://0ec90b57d6e95fcbda19832f.supabase.co` |
| **Database Host** | `db.0ec90b57d6e95fcbda19832f.supabase.co` |

### Get Database Credentials:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings** > **Database**
4. Copy these values:
   - **Host**: `db.0ec90b57d6e95fcbda19832f.supabase.co` (or from Connection string)
   - **Database name**: `postgres`
   - **Username**: `postgres`
   - **Password**: [Your database password - set during project creation]
   - **Port**: `5432`

### Get Connection String:

In Supabase Dashboard, go to **Settings** > **Database** > **Connection string** > **URI** format:
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

---

## Step 2: Set Up Google Cloud (OAuth + Gemini)

### Create Google OAuth Client:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Application type: **Web application**
6. Add authorized redirect URIs:
   - For development: `http://localhost:5000/api/v1/auth/google/callback`
   - For production: `https://your-api.onrender.com/api/v1/auth/google/callback`
7. Copy **Client ID** and **Client Secret**

### Enable Gemini API:

1. In Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Gemini API"
3. Click **Enable**
4. Go to **Credentials** > **Create Credentials** > **API Key**
5. Copy the API key

---

## Step 3: Set Up Paynow (Optional for Initial Testing)

1. Sign up at [paynow.co.zw](https://www.paynow.co.zw)
2. Go to **Integration Settings**
3. Copy **Integration ID** and **Integration Key**
4. For testing, set `PAYNOW_SANDBOX=true`

---

## Step 4: Push Code to GitHub

1. Initialize git repository:
```bash
cd /tmp/cc-agent/68553015/project
git init
git add .
git commit -m "Initial commit - FreightLink Africa"
```

2. Create repository on GitHub:
   - Go to [github.com/new](https://github.com/new)
   - Name: `freightlink-africa`
   - Keep it **Private** (recommended for production)
   - Don't initialize with README (you already have one)
   - Click **Create repository**

3. Push to GitHub:
```bash
git remote add origin https://github.com/YOUR_USERNAME/freightlink-africa.git
git branch -M main
git push -u origin main
```

---

## Step 5: Deploy to Render

### 5.1 Create New Blueprint

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** > **Blueprint**
3. Connect your GitHub account if not already connected
4. Select your `freightlink-africa` repository
5. Render will detect `render.yaml` and show 3 services:
   - `freightlink-api` (Web Service)
   - `freightlink-web` (Static Site)
   - `freightlink-redis` (Redis)

6. Click **Apply** to start deployment

### 5.2 Configure Environment Variables

Before or during deployment, set these in **Render Dashboard** > **freightlink-api** > **Environment**:

#### Required - Database (Supabase)

| Key | Value |
|-----|-------|
| `DB_HOST` | `aws-0-us-east-1.pooler.supabase.com:5432` (use pooler for transaction mode) |
| `DB_PORT` | `5432` |
| `DB_NAME` | `postgres` |
| `DB_USER` | `postgres.0ec90b57d6e95fcbda19832f` |
| `DB_PASSWORD` | [Your Supabase database password] |

**To get the pooler connection string:**
1. Supabase Dashboard > Settings > Database
2. Under **Connection string**, select **Transaction** mode
3. Copy the host (e.g., `aws-0-us-east-1.pooler.supabase.com`)

#### Required - Google OAuth

| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | Your Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | `https://freightlink-api.onrender.com/api/v1/auth/google/callback` |

#### Required - Gemini AI

| Key | Value |
|-----|-------|
| `GEMINI_API_KEY` | Your Google AI API Key |

#### Required - Paynow (Update URLs for Production)

| Key | Value |
|-----|-------|
| `PAYNOW_INTEGRATION_ID` | Your Paynow Integration ID |
| `PAYNOW_INTEGRATION_KEY` | Your Paynow Integration Key |
| `PAYNOW_SANDBOX` | `false` (for production) |
| `PAYNOW_RESULT_URL` | `https://freightlink-api.onrender.com/api/v1/webhooks/paynow/result` |
| `PAYNOW_RETURN_URL` | `https://freightlink-web.onrender.com/payment/complete` |

#### Auto-Configured (No action needed)

These are auto-generated or linked by Render:

| Key | Source |
|-----|--------|
| `JWT_SECRET` | Auto-generated by Render |
| `JWT_REFRESH_SECRET` | Auto-generated by Render |
| `REDIS_HOST` | Linked from freightlink-redis |
| `REDIS_PORT` | Linked from freightlink-redis |
| `FRONTEND_URL` | Linked from freightlink-web |
| `CORS_ORIGINS` | Linked from freightlink-web |

---

## Step 6: Verify Deployment

### Check Service Status:

1. In Render Dashboard, verify all 3 services are **Live**:
   - `freightlink-api` - Backend API
   - `freightlink-web` - Frontend
   - `freightlink-redis` - Redis cache

### Test API Health:

```bash
# Health check
curl https://freightlink-api.onrender.com/health

# Expected response:
# {"status":"ok","timestamp":"...","uptime":...,"version":"1.0.0"}
```

### Test Frontend:

1. Open `https://freightlink-web.onrender.com`
2. Verify the home page loads
3. Test login/registration pages

### Check Database Migration:

1. Go to **freightlink-api** > **Logs**
2. Look for: `All migrations completed successfully`

---

## Step 7: Update Google OAuth Redirect URI

After deployment, update Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. **APIs & Services** > **Credentials**
3. Edit your OAuth client
4. Add to **Authorized redirect URIs**:
   ```
   https://freightlink-api.onrender.com/api/v1/auth/google/callback
   ```
5. **Save**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         RENDER CLOUD                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │  freightlink-web│     │ freightlink-api │                    │
│  │  (Static Site)   │────▶│  (Node.js)      │                    │
│  │  React Frontend  │     │  Express 5 API  │                    │
│  └─────────────────┘     └────────┬────────┘                    │
│                                    │                              │
│                           ┌────────▼────────┐                    │
│                           │ freightlink-redis│                   │
│                           │ (Session Cache)  │                    │
│                           └─────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ PostgreSQL Connection
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SUPABASE (PostgreSQL)                      │
│  - Database: postgres                                            │
│  - Tables: users, loads, payments, contact_unlocks, etc.         │
│  - Host: db.0ec90b57d6e95fcbda19832f.supabase.co                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables Quick Reference

### Backend (freightlink-api)

```yaml
# Application
NODE_ENV=production
PORT=5000
APP_NAME=FreightLink Africa
API_VERSION=v1

# Database (Supabase)
DB_HOST=aws-0-us-east-1.pooler.supabase.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres.0ec90b57d6e95fcbda19832f
DB_PASSWORD=[YOUR_PASSWORD]
DB_MAX_CONNECTIONS=20

# JWT (Auto-generated)
JWT_SECRET=[AUTO_GENERATED]
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=[AUTO_GENERATED]
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=freightlink.africa

# Google OAuth
GOOGLE_CLIENT_ID=[YOUR_CLIENT_ID]
GOOGLE_CLIENT_SECRET=[YOUR_CLIENT_SECRET]
GOOGLE_REDIRECT_URI=https://freightlink-api.onrender.com/api/v1/auth/google/callback

# Gemini AI
GEMINI_API_KEY=[YOUR_API_KEY]
GEMINI_MODEL=gemini-1.5-flash

# Paynow
PAYNOW_INTEGRATION_ID=[YOUR_ID]
PAYNOW_INTEGRATION_KEY=[YOUR_KEY]
PAYNOW_SANDBOX=false
PAYNOW_RESULT_URL=https://freightlink-api.onrender.com/api/v1/webhooks/paynow/result
PAYNOW_RETURN_URL=https://freightlink-web.onrender.com/payment/complete

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_MAX=100
CORS_ORIGINS=https://freightlink-web.onrender.com

# Pricing
BASE_UNLOCK_PRICE=2.00

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### Frontend (freightlink-web)

```yaml
VITE_API_URL=https://freightlink-api.onrender.com
VITE_APP_NAME=FreightLink Africa
```

---

## Troubleshooting

### Issue: Database connection fails

**Solution:**
1. Verify DB_HOST uses the pooler URL (not direct connection)
2. Check Supabase database password is correct
3. Ensure Supabase project is not paused (free tier pauses after inactivity)

### Issue: OAuth callback fails

**Solution:**
1. Verify GOOGLE_REDIRECT_URI matches exactly in Render and Google Console
2. Check that the URI ends with `/api/v1/auth/google/callback`

### Issue: CORS errors

**Solution:**
1. Verify CORS_ORIGINS includes your frontend URL
2. Render auto-links this via `fromService` in render.yaml

### Issue: Migrations don't run

**Solution:**
1. Check Render logs for migration errors
2. Manually run: Go to **Shell** in Render and run `npm run migrate`

### Issue: Redis connection fails

**Solution:**
1. Verify freightlink-redis service is running
2. Check REDIS_HOST and REDIS_PORT are linked correctly

---

## Cost Estimation (Render Monthly)

| Service | Plan | Cost |
|---------|------|------|
| freightlink-api | Starter | $7 |
| freightlink-redis | Starter | Free |
| freightlink-web | Static | Free |
| **Total** | | **$7/month** |

**Production Recommended:**

| Service | Plan | Cost |
|---------|------|------|
| freightlink-api | Standard | $25 |
| freightlink-redis | Standard | $15 |
| freightlink-web | Static | Free |
| **Total** | | **$40/month** |

---

## Next Steps After Deployment

1. **Test the full flow**: Register → Login → Create Load → Browse → Unlock Contact
2. **Set up monitoring**: Connect Render to Slack/PagerDuty for alerts
3. **Configure custom domain**: Add your domain in Render settings
4. **Set up CI/CD**: Enable auto-deploy on main branch pushes
5. **Database backups**: Configure Supabase backups (daily recommended)

---

## Support

- **Render docs**: [render.com/docs](https://render.com/docs)
- **Supabase docs**: [supabase.com/docs](https://supabase.com/docs)
- **Project issues**: Create issue in your GitHub repository
