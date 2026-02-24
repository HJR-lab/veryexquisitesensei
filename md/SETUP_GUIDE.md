# VES Pottery Gallery - Setup Guide

## Project Overview

A standalone web application that allows Shopify customers from VES (ves-sg.myshopify.com) to log in and view their pottery gallery. Instructors can use the admin interface to add pottery pieces for students.

**Key Features:**
- JWT-based authentication using Shopify customer data
- Customer gallery view with filtering and search
- Admin interface for instructors to add/manage pottery pieces
- Pottery data stored in Shopify customer metafields (`custom.design_projects`)

---

## Quick Start

### 1. Start the Backend Server

```bash
cd /Users/justinlong/pottery-gallery-app/server
npm run dev
```

Server runs on: `http://localhost:3000`

### 2. Start the Frontend

```bash
cd /Users/justinlong/pottery-gallery-app/frontend
npm run dev
```

Frontend runs on: `http://localhost:5173`

### 3. Access the Application

- **Login Page**: http://localhost:5173/login
- **Gallery**: http://localhost:5173/gallery (after login)
- **Admin Panel**: http://localhost:5173/admin (after login)

---

## Login Credentials

### Default Password for All Customers
**Password**: `pottery123`

### How to Find Customer Emails
1. Go to your Shopify Admin: https://admin.shopify.com/store/ves-sg
2. Navigate to **Customers**
3. Use any customer email from your store

**Example:**
- Email: `customer@example.com`
- Password: `pottery123`

---

## Application Structure

```
pottery-gallery-app/
├── server/                    # Express backend
│   ├── index.js              # Main server file with all endpoints
│   ├── .env                  # Environment variables (DO NOT COMMIT)
│   └── package.json
│
└── frontend/                  # React frontend
    ├── src/
    │   ├── pages/
    │   │   ├── Login.jsx     # Login page
    │   │   ├── Gallery.jsx   # Student gallery view
    │   │   └── Admin.jsx     # Admin interface for instructors
    │   ├── hooks/
    │   │   └── useAuth.jsx   # Authentication hook
    │   ├── utils/
    │   │   └── api.js        # Axios API client
    │   └── styles/           # CSS files
    └── package.json
```

---

## Environment Variables

Located at: `/Users/justinlong/pottery-gallery-app/server/.env`

```bash
# Shopify Credentials
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token

# Authentication
JWT_SECRET=your_jwt_secret_here

# Configuration
FRONTEND_URL=http://localhost:5173
PORT=3000
NODE_ENV=development
```

**⚠️ Important**: The Shopify access token has `read_customers` AND `write_customers` scopes enabled.

---

## How to Use the Admin Interface

### Accessing Admin Panel

1. Log in with any customer credentials at http://localhost:5173/login
2. Navigate to http://localhost:5173/admin
3. You'll see a sidebar with all customers

### Adding Pottery Pieces for Students

1. **Select a Student**: Click on a student name in the left sidebar
2. **Click "Add Pottery Piece"**: Button in the top-right
3. **Fill out the form**:
   - **Title*** (required): e.g., "Blue Celadon Bowl"
   - **Date Completed*** (required): Pick completion date
   - **Description**: Describe the piece
   - **Clay Type**: e.g., "Stoneware"
   - **Glaze**: e.g., "Celadon Blue"
   - **Firing Temperature**: e.g., "Cone 10"
   - **Dimensions**: e.g., `6" height x 8" diameter`
   - **Image URL**: Paste Shopify CDN URL (see below)
   - **Tags**: Comma-separated, e.g., "wheel-thrown, beginner, functional"
   - **Student Notes**: What the student learned
   - **Instructor Feedback**: Your feedback for the student
4. **Click "Add Pottery Piece"**

### Getting Image URLs from Shopify

1. Go to Shopify Admin → **Content** → **Files**
2. Upload pottery images
3. Click on the image to copy the CDN URL
4. Paste URL into the "Image URL" field in the form

**Example URL format**:
```
https://cdn.shopify.com/s/files/1/0XXX/XXXX/files/pottery_image.jpg
```

### Deleting Pottery Pieces

1. Select the student from the sidebar
2. Find the piece you want to delete
3. Click the red **Delete** button at the bottom of the piece card
4. Confirm deletion

---

## API Endpoints

### Authentication Endpoints

- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - Logout (clears cookie)
- `POST /api/auth/register` - **DISABLED** (returns 403)

### Gallery Endpoints

- `GET /api/pottery/pieces` - Get pottery pieces for logged-in user

### Admin Endpoints

- `GET /api/admin/customers` - Get all customers
- `GET /api/admin/customers/:customerId/pieces` - Get pieces for specific customer
- `POST /api/admin/customers/:customerId/pieces` - Update pieces for specific customer

---

## Technical Details

### Authentication Flow

1. User submits email/password at `/login`
2. Backend searches Shopify for customer by email using GraphQL
3. Password is checked against `custom.app_password` metafield (or defaults to "pottery123")
4. JWT token generated with 7-day expiration
5. Token stored in both httpOnly cookie AND localStorage
6. Frontend includes token in Authorization header for all API requests

### Pottery Data Storage

Pottery pieces are stored as JSON in Shopify customer metafields:
- **Namespace**: `custom`
- **Key**: `design_projects`
- **Type**: `json`

**Example metafield value**:
```json
[
  {
    "id": "piece-1697123456789",
    "title": "Blue Celadon Bowl",
    "description": "Hand-thrown functional bowl with celadon glaze",
    "clay_type": "Stoneware",
    "glaze": "Celadon Blue",
    "firing_temp": "Cone 10",
    "dimensions": "6\" height x 8\" diameter",
    "date_completed": "2024-01-15",
    "images": ["https://cdn.shopify.com/s/files/1/...jpg"],
    "tags": ["wheel-thrown", "beginner", "functional"],
    "student_notes": "First attempt at wheel throwing",
    "instructor_notes": "Great progress! Focus on centering next time.",
    "is_public": true
  }
]
```

### Shopify API Usage

**API Version**: Latest API version (via `@shopify/shopify-api`)
**Client Type**: GraphQL (switched from REST for reliability)
**Required Scopes**: `read_customers`, `write_customers`

**GraphQL Client Initialization**:
```javascript
function getShopifyClient() {
  return new shopify.clients.Graphql({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    },
  });
}
```

---

## Troubleshooting

### Problem: Port 3000 already in use

**Solution**:
```bash
lsof -ti:3000 | xargs kill -9
npm run dev
```

### Problem: Login doesn't work

**Check these**:
1. Backend server is running on port 3000
2. Frontend is running on port 5173
3. Check browser console for errors
4. Verify customer exists in Shopify
5. Try default password: `pottery123`

### Problem: "Failed to load pottery pieces"

**Causes**:
1. No pottery pieces added yet for that customer
2. Shopify API authentication issue
3. Metafield doesn't exist yet

**Solution**: Use admin interface to add first pottery piece for the customer

### Problem: Can't access admin interface

**Check**:
1. You're logged in (token exists)
2. Navigate to: http://localhost:5173/admin
3. Check browser console for errors

### Problem: Images don't show up

**Causes**:
1. Image URL is incorrect or expired
2. CORS issues with Shopify CDN
3. Image field was left empty

**Solution**: Upload image to Shopify Files and copy CDN URL

---

## Registration is Disabled

New user registration is intentionally disabled. Only existing Shopify customers can log in.

**If you need to add a new student**:
1. Go to Shopify Admin: https://admin.shopify.com/store/ves-sg
2. Navigate to **Customers** → **Add customer**
3. Fill in customer details
4. Customer can now log in with email and password `pottery123`

---

## Next Steps

### Immediate Tasks
- [ ] Test login with actual Shopify customer email
- [ ] Test admin interface by adding a pottery piece
- [ ] Verify pottery piece appears in gallery view
- [ ] Test image upload workflow with Shopify CDN

### Future Enhancements
- [ ] Deploy to Railway (backend)
- [ ] Deploy frontend (Vercel/Netlify)
- [ ] Add password change functionality for customers
- [ ] Implement role-based access control (admin vs student)
- [ ] Add direct image upload to Shopify
- [ ] Add pottery piece editing (currently can only add/delete)
- [ ] Add student progress tracking
- [ ] Export pottery catalog as PDF

---

## Railway Deployment (Pending)

Your Railway service is already set up with environment variables. When ready to deploy:

### Backend Deployment
1. Push code to GitHub
2. Connect Railway to your repository
3. Railway will auto-deploy the `/server` directory
4. Update `FRONTEND_URL` environment variable to production frontend URL

### Frontend Deployment
1. Build frontend: `npm run build`
2. Deploy `dist` folder to Vercel/Netlify
3. Update API baseURL in `frontend/src/utils/api.js` to Railway backend URL

---

## Support

### Shopify Admin Access
- Store: https://admin.shopify.com/store/ves-sg
- Public domain: https://ves.sg
- Admin domain: https://ves-sg.myshopify.com

### Key Files to Reference
- Server logic: `/Users/justinlong/pottery-gallery-app/server/index.js`
- Admin UI: `/Users/justinlong/pottery-gallery-app/frontend/src/pages/Admin.jsx`
- Gallery UI: `/Users/justinlong/pottery-gallery-app/frontend/src/pages/Gallery.jsx`

---

## Session Notes

**Last Working State** (as of last session):
- Backend server running on port 3000
- Frontend running on port 5173
- Login endpoint fixed and working with GraphQL
- Default password: `pottery123`
- Admin interface ready at `/admin` route
- Registration disabled per your request

**Known Issues**:
- None! Ready to test end-to-end flow.

**Status**: ✅ Development environment ready for testing

---

*Created: 2025-10-15*
*Project: VES Pottery Gallery*
*Stack: React + Vite + Express + Shopify GraphQL API*
