# Shopify Webhook Setup - Automatic Course Sync

## System Overview

Your app has **automatic course synchronization** already built in! When students purchase courses on Shopify, the system automatically:

✅ Creates course enrollments
✅ Waits for 4+ students (Wheelthrowing only)
✅ Creates all 6 class instances
✅ Enrolls all students in all classes
✅ Sends them booking confirmations

## How It Works

### Webhook Endpoint
```
POST https://your-server.vercel.app/api/shopify/webhook/orders
```

### Threshold Logic
- **Wheelthrowing courses**: Creates classes when ≥4 students enroll
- **Handbuilding courses**: Creates classes immediately (no minimum)

### Class Instance Creation
Uses the `courseScheduler.js` to generate:
- Correct class identifiers (e.g., `WT2501TU_DL1.1`)
- All 6 weekly class instances
- Proper dates based on the course start date and schedule pattern

## Verify Webhook is Active

### 1. Check Shopify Admin

1. Go to **Settings** → **Notifications** → **Webhooks**
2. Look for webhook pointing to: `https://your-server.vercel.app/api/shopify/webhook/orders`
3. Event should be: **Order creation**
4. Format: **JSON**

### 2. Test the System

#### Option A: Test Order (Recommended)
1. Create a test product order in Shopify
2. Check server logs for: `📦 Received order webhook from Shopify`
3. Verify enrollment created in database

#### Option B: Monitor Real Orders
1. Deploy backend to Vercel: `vercel --prod`
2. Wait for actual course purchases
3. Check logs: `vercel logs`

## Manual Trigger for Existing Orders

If you have recent orders that haven't been processed, run this script:

```bash
node import-new-courses-jan-2025.js
```

This will:
1. Fetch all orders from Dec 2024 onwards
2. Process course enrollments
3. Create class instances for cohorts with ≥4 students
4. Create all bookings

## Course Information Requirements

The system parses course info from Shopify product fields:

### Product Title
`"Wheelthrowing Beginner/Ext 6 Weeks"` or `"Handbuilding Pottery Course"`

### Variant Title (Schedule)
Examples:
- `"Tuesday 7:00pm-9:30pm (20 Jan - 3 Mar)"`
- `"Saturday Morning 9:30am-12:00pm (17 Jan - 21 Feb)"`
- `"Friday 9:30am-12:00pm (23 Jan - 27 Feb)"`

The system extracts:
- Day of week (Tuesday, Saturday, etc.)
- Time range (7:00pm-9:30pm)
- Start and end dates
- Generates cohort ID to group students

## Monitoring

### Check Course Enrollments
```sql
SELECT * FROM course_enrollments
WHERE created_at >= '2024-12-01'
ORDER BY created_at DESC;
```

### Check Pending Cohorts
```sql
SELECT course_type, schedule_pattern, course_start_date, COUNT(*) as students
FROM course_enrollments
WHERE status = 'pending'
GROUP BY course_type, schedule_pattern, course_start_date;
```

### Check Confirmed Cohorts
```sql
SELECT course_type, schedule_pattern, course_start_date, COUNT(*) as students
FROM course_enrollments
WHERE status = 'confirmed'
GROUP BY course_type, schedule_pattern, course_start_date;
```

## Troubleshooting

### Webhook Not Receiving Events
1. Verify webhook URL in Shopify admin
2. Check server is deployed and accessible
3. Test with `curl` to verify endpoint responds

### Classes Not Creating
1. Check if threshold met (4+ students for Wheelthrowing)
2. Verify course info parsing - check logs for parse errors
3. Look for errors in `processCoursePurchase` function

### Bookings Not Created
1. Check `course_enrollments` table for `status='confirmed'`
2. Verify `class_instances` were created
3. Check `bookings` table for recent entries

## Key Files

- `/server/index.js:3930` - Webhook endpoint
- `/server/utils/courseEnrollmentManager.js` - Main logic
- `/server/utils/courseScheduler.js` - Class date generation
- `/server/utils/supabaseDb.js` - Database operations
