# Pottery Gallery - App Proxy Setup Guide

## Overview

Since customer account UI extensions don't support metafield access, we're using an **App Proxy** approach that WILL work with real customer data.

## Architecture

```
Customer Browser
    ↓
Shopify Store (ves.sg/apps/pottery-gallery)
    ↓
Shopify App Proxy
    ↓
Your Express Server (fetches metafield data)
    ↓
Shopify Admin API
```

## What You Need

1. **A server to host the app** (Heroku, Railway, Vercel, or local with ngrok)
2. **Shopify Admin API access token**
3. **App proxy configuration in Shopify**

## Step-by-Step Setup

### 1. Install Server Dependencies

```bash
cd server
npm install
```

### 2. Get Shopify API Credentials

#### A. Get API Key and Secret
1. Go to Shopify Partners → Apps → Your App
2. Copy **API key** and **API secret key**

#### B. Get Access Token
1. In Shopify Admin: **Settings → Apps and sales channels → Develop apps**
2. Click **Create an app** (if you haven't)
3. **Configure Admin API scopes**: Select `read_customers`
4. Click **Install app**
5. Copy the **Admin API access token** (save it securely!)

### 3. Configure Environment Variables

Create `server/.env`:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
SHOPIFY_API_KEY=your_api_key_from_partners
SHOPIFY_API_SECRET=your_api_secret_from_partners
SHOPIFY_SHOP_DOMAIN=ves.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_admin_api_access_token
PORT=3000
NODE_ENV=development
```

### 4. Test Server Locally

```bash
cd server
npm run dev
```

Visit: `http://localhost:3000/health`

You should see: `{"status":"ok","timestamp":"..."}`

### 5. Deploy Server (Choose One)

#### Option A: Railway (Recommended - Free Tier)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
cd server
railway init
railway up
```

Copy your Railway URL (e.g., `https://pottery-gallery.up.railway.app`)

#### Option B: Heroku

```bash
# Install Heroku CLI
brew tap heroku/brew && brew install heroku

# Login and create app
heroku login
heroku create ves-pottery-gallery

# Set environment variables
heroku config:set SHOPIFY_API_KEY=your_key
heroku config:set SHOPIFY_API_SECRET=your_secret
heroku config:set SHOPIFY_ACCESS_TOKEN=your_token
heroku config:set SHOPIFY_SHOP_DOMAIN=ves.myshopify.com

# Deploy
git push heroku main
```

#### Option C: ngrok (Local Testing)

```bash
# Install ngrok
brew install ngrok

# Start your server
cd server
npm run dev

# In another terminal, expose it
ngrok http 3000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

### 6. Configure Shopify App Proxy

1. Go to **Shopify Partners → Apps → Your App → Configuration**
2. Scroll to **App proxy** section
3. Click **Set up**
4. Configure:
   - **Subpath prefix**: `apps`
   - **Subpath**: `pottery-gallery`
   - **Proxy URL**: `https://your-server-url.com` (from step 5)
5. Click **Save**

### 7. Test the API

Visit in your browser (while logged in as a customer on ves.sg):

```
https://ves.sg/apps/pottery-gallery/api/pieces
```

You should see your pottery data!

## Frontend Setup

Now we need to create a React frontend that uses this API.

### Install Frontend Dependencies

```bash
cd ..
npm install --save-dev vite @vitejs/plugin-react
```

### Build Frontend

The frontend will be a simple React app that:
1. Fetches data from `/apps/pottery-gallery/api/pieces`
2. Displays the pottery gallery UI
3. Works exactly like the extension, but with REAL DATA

## How It Works

1. **Customer visits** `https://ves.sg/apps/pottery-gallery`
2. **Shopify proxies** the request to your server
3. **Shopify adds** customer ID to the request automatically
4. **Your server** fetches the metafield using Admin API
5. **Server returns** the pottery data
6. **Frontend displays** the gallery

## Security

- ✅ Shopify verifies the request signature
- ✅ Customer ID is passed securely by Shopify
- ✅ Admin API token never exposed to frontend
- ✅ Only works for logged-in customers

## Next Steps

Once the server is deployed and app proxy is configured:

1. I'll create the React frontend
2. Build and deploy the frontend
3. Test with real customer data
4. Link it from customer account

## Costs

- **Railway**: Free tier (500 hours/month)
- **Heroku**: $5-7/month
- **ngrok**: Free for testing

## Troubleshooting

**"Invalid signature" error:**
- Check your `SHOPIFY_API_SECRET` is correct
- Make sure you're accessing via the proxy URL, not directly

**"Failed to fetch pottery pieces":**
- Check `SHOPIFY_ACCESS_TOKEN` is valid
- Verify the token has `read_customers` scope
- Check customer has the metafield data

**Empty pieces array:**
- Make sure metafield is on the logged-in customer
- Check metafield namespace/key is exactly `custom.design_projects`
- Verify JSON format is valid

Ready to proceed? Let me know when you've deployed the server and I'll create the frontend!
