# VES Pottery Gallery - Standalone Web App Deployment Guide

## Overview

You now have a complete standalone web application where VES students can log in and view their pottery portfolios. The app pulls customer data from your Shopify store using the Admin API.

## Architecture

```
Student Browser
    ↓
Your Web App (pottery.ves.sg or your-app.railway.app)
    ↓
Express Backend (JWT Authentication)
    ↓
Shopify Admin API (Customer Metafields)
```

## What You Have

### Backend (`/server`)
- **Express API** with JWT authentication
- **Auth endpoints**: `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`
- **Gallery endpoints**: `/api/pottery/pieces`
- **Shopify integration**: Reads customer metafields via Admin API
- **Password storage**: Hashed passwords in customer metafields

### Frontend (`/frontend`)
- **React + Vite** application
- **Login/Register** pages
- **Gallery view** with filtering and search
- **Responsive design** matching VES brand aesthetic
- **Modal details** for pottery pieces

## Step 1: Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

## Step 2: Configure Environment Variables

### Local Development

Create `server/.env`:

```bash
# Shopify Credentials
SHOPIFY_API_KEY=21b10904445cab087b9ad08017d412f2
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_SHOP_DOMAIN=ves.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_admin_api_access_token

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long

# CORS
FRONTEND_URL=http://localhost:5173

# Server Config
PORT=3000
NODE_ENV=development
```

### Generate JWT Secret

Run this to generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 3: Test Locally

### Terminal 1: Start Backend

```bash
cd server
npm run dev
```

Should see:
```
🎨 VES Pottery Gallery API running on port 3000
📍 Health check: http://localhost:3000/health
🔐 Auth endpoints: /api/auth/*
🏺 Gallery endpoints: /api/pottery/*
```

### Terminal 2: Start Frontend

```bash
cd frontend
npm run dev
```

Should see:
```
VITE v5.0.8  ready in 500 ms
➜  Local:   http://localhost:5173/
```

### Test the App

1. Visit `http://localhost:5173`
2. Click "Register" to create an account
3. Fill in your details and register
4. You should be redirected to the gallery

## Step 4: Deploy to Railway

### A. Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### B. Create Railway Project

```bash
cd pottery-gallery-app
railway init
```

Choose:
- **Empty project** (we'll configure manually)

### C. Add Environment Variables in Railway

Go to your Railway dashboard and add:

```
SHOPIFY_API_KEY=21b10904445cab087b9ad08017d412f2
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_SHOP_DOMAIN=ves.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_admin_api_access_token
JWT_SECRET=your-generated-jwt-secret
FRONTEND_URL=https://your-app.up.railway.app
NODE_ENV=production
PORT=3000
```

### D. Build and Deploy

```bash
# Build frontend
cd frontend
npm run build

# This creates files in server/public/

# Deploy to Railway
cd ../server
railway up
```

### E. Get Your URL

Railway will provide a URL like:
```
https://pottery-gallery-production.up.railway.app
```

Update `FRONTEND_URL` in Railway dashboard to this URL.

## Step 5: Configure Custom Domain (Optional)

In Railway dashboard:
1. Go to Settings → Domains
2. Add custom domain: `pottery.ves.sg`
3. Update DNS records at your domain provider:
   ```
   CNAME pottery your-app.up.railway.app
   ```

## Step 6: Add Test Data

### Option 1: Via Shopify Admin

1. Go to Shopify Admin → Customers
2. Find a customer (or create one)
3. Scroll to Metafields
4. Add `custom.design_projects` (JSON type)
5. Paste sample data from `sample-data.json`

### Option 2: Via API (Programmatic)

You can use the Shopify Admin API to bulk add pottery data. See `sample-data.json` for structure.

## How Students Use the App

### First Time Setup

1. **Register**: Students visit `pottery.ves.sg` and create an account
   - They use their email
   - Set a password (not related to main Shopify store)
   - This creates a Shopify customer record

2. **Staff Adds Pottery Data**: VES staff adds pottery pieces to the customer's metafield
   - Via Shopify Admin → Customers → Metafields
   - Or via automated workflow

3. **Student Views Gallery**: Student logs in and sees their pottery portfolio

### Ongoing Use

- Students log in anytime to view their pottery
- Gallery updates automatically when staff adds new pieces
- Students can filter by tags, search pieces
- Click any piece to see full details

## Authentication Flow

1. **Register/Login** → Creates JWT token
2. **Token stored** in localStorage and httpOnly cookie
3. **Every API request** includes token
4. **Backend verifies** token and fetches customer data from Shopify
5. **Gallery displays** pottery pieces from customer metafield

## Password Management

Passwords are stored securely:
- **Hashed with bcrypt** (10 rounds)
- **Stored in customer metafield** `custom.app_password`
- **Never exposed** to frontend
- **JWT tokens** expire after 7 days

## Default Password

For existing customers without a password set, the default is: `pottery123`

You should have staff reset this after first login.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Sign out

### Pottery Gallery
- `GET /api/pottery/pieces` - Get all pieces for logged-in user
- `POST /api/pottery/pieces` - Update pieces (admin/staff)

### Utility
- `GET /health` - Health check

## Troubleshooting

### "Login failed"
- Check Shopify credentials in Railway env vars
- Verify customer exists in Shopify
- Check Railway logs: `railway logs`

### "Failed to fetch pottery pieces"
- Verify `SHOPIFY_ACCESS_TOKEN` has `read_customers` scope
- Check metafield exists: `custom.design_projects`
- Ensure metafield is valid JSON

### CORS errors
- Update `FRONTEND_URL` in Railway to match your domain
- Rebuild and redeploy

### Images not loading
- Use Shopify CDN URLs for images
- Ensure images are publicly accessible
- Check image URLs in metafield data

## Maintenance

### Adding New Pottery Pieces

Via Shopify Admin:
1. Customers → Select student
2. Metafields → `custom.design_projects`
3. Edit JSON, add new piece object
4. Save

### Updating Customer Passwords

Via API or manually:
1. Generate hash: `bcrypt.hash('newpassword', 10)`
2. Update `custom.app_password` metafield
3. Student logs in with new password

### Monitoring

Check Railway logs for errors:
```bash
railway logs
```

Check app health:
```bash
curl https://your-app.up.railway.app/health
```

## Security Considerations

- ✅ Passwords hashed with bcrypt
- ✅ JWT tokens with expiration
- ✅ httpOnly cookies (prevents XSS)
- ✅ CORS configured properly
- ✅ Admin API token never exposed to frontend
- ✅ Protected API routes require authentication

## Cost Estimate

- **Railway**: Free tier (500 hours/month) or ~$5/month
- **Custom Domain**: $10-15/year
- **Total**: Essentially free or ~$5/month

## Next Steps

1. ✅ Deploy to Railway
2. ✅ Test with real customer data
3. ✅ Set up custom domain
4. Add staff admin panel (future enhancement)
5. Add email notifications (future enhancement)
6. Add public portfolio sharing (future enhancement)

## Support

If you encounter issues:
1. Check Railway logs
2. Verify environment variables
3. Test locally first
4. Check Shopify API permissions

---

**Your standalone pottery gallery web app is ready! Students can now log in and view their pottery portfolios independently from the main VES store.**
