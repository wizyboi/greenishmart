# GreenishMart Backend on Render.com

## Automated Deployment Guide

### Prerequisites

- GitHub account (already connected)
- Render.com free account
- Environment variables ready

### One-Click Deploy

Click this link to start deployment on Render:

```
https://render.com/deploy?repo=https://github.com/wizyboi/greenishmart
```

### Manual Steps (if One-Click fails):

1. **Go to Render Dashboard:** https://dashboard.render.com
2. **Click "New +"** → Select **"Web Service"**
3. **Select Repository:** Choose `greenishmart` → branch `master`
4. **Configure:**
   - **Name:** `greenishmart-backend`
   - **Environment:** `Docker`
   - **Region:** `Oregon` (free tier)
   - **Plan:** `Free`
5. **Build Command:**
   ```
   pip install -r django_backend/requirements.txt && cd django_backend && python manage.py migrate && python manage.py collectstatic --noinput
   ```
6. **Start Command:**
   ```
   cd django_backend && gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT --workers 3
   ```
7. **Add Environment Variables:**
   ```
   DEBUG = False
   SECRET_KEY = django-insecure-your-secret-key-here
   ALLOWED_HOSTS = *.render.com,localhost,127.0.0.1
   EMAIL_HOST_USER = wizyomeka@gmail.com
   EMAIL_HOST_PASSWORD = kkivwywogpobzdje
   DEFAULT_FROM_EMAIL = GreenishMart <wizyomeka@gmail.com>
   ```
8. **Click "Create Web Service"**

### Expected Result

- Build: ~3-5 minutes
- URL: `https://greenishmart-backend.onrender.com`
- Health check: `https://greenishmart-backend.onrender.com/api/health/`

### After Deployment

Update `script.js` with the new backend URL:

```javascript
const API_BASE = "https://greenishmart-backend.onrender.com/api";
```

Then redeploy frontend to Vercel.

### Troubleshooting

- **502 Bad Gateway:** Check logs in Render dashboard, ensure migrations ran
- **Static files 404:** WhiteNoise should handle this; check `STATIC_ROOT` setting
- **Email not sending:** Verify Gmail app password in env vars

---

**Status:** ✅ Code pushed to GitHub → Ready for Render deployment
