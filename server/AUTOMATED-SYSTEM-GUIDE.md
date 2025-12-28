# VES Pottery Gallery - Automated Course System

## 🎯 What Changed

**Before:** Manual scripts that created classes immediately for all orders
**Now:** Automated webhook system that waits for 4+ students before creating classes

## 🐛 Bug Fixed

The cohort matching was grouping students **only by date + day**, ignoring the **time**.

Result: All Saturday students (9:30am + 1:00pm) were grouped into one course.

**Fix:** Updated `findCohortEnrollments()` to match by:
- Course type (Wheelthrowing/Handbuilding)
- Start date
- Day of week
- **Time** ⬅️ This was missing!

## 🚀 How to Set Up Automated System

### 1. Clean Up and Re-Import

Run the automated setup script:

```bash
node SETUP-AUTOMATED.js
```

This will:
- ✅ Delete all `course_enrollments`
- ✅ Delete all `class_instances` (2025+)
- ✅ Delete all `bookings`
- ✅ Re-import from Shopify using automated webhook logic

### 2. Verify Webhook is Running

Check your deployed backend has the webhook endpoint:

```
POST https://your-server.vercel.app/api/shopify/webhook/orders
```

In Shopify Admin → Settings → Notifications → Webhooks, verify:
- Event: `Order creation`
- URL: Your webhook endpoint
- Format: JSON

## 📋 How It Works

### Automatic Flow

```
1. Customer buys course on Shopify
   ↓
2. Webhook triggers → creates course_enrollment (status: pending)
   ↓
3. System checks: Do we have 4+ students for this cohort?
   ├─ YES (Wheelthrowing): Create 6 classes + bookings → status: confirmed
   ├─ NO (Wheelthrowing): Wait for more students
   └─ Handbuilding: Create classes immediately (no threshold)
```

### Cohort Matching

Students are grouped into cohorts by:
- **Course type**: Wheelthrowing Beginner
- **Start date**: 2026-01-17
- **Day**: SATURDAY  
- **Time**: 1:00 PM - 3:30 PM ⬅️ Now properly separated!

### Threshold Rules

- **Wheelthrowing**: Requires 4+ students before creating classes
- **Handbuilding**: Creates classes immediately (no minimum)

## 🔍 Monitoring

### Check Pending Enrollments

```sql
SELECT course_type, schedule_pattern, class_time, course_start_date, COUNT(*) as students
FROM course_enrollments
WHERE status = 'pending'
GROUP BY course_type, schedule_pattern, class_time, course_start_date;
```

### Check Confirmed Courses

```sql
SELECT course_type, schedule_pattern, class_time, course_start_date, COUNT(*) as students
FROM course_enrollments
WHERE status = 'confirmed'
GROUP BY course_type, schedule_pattern, class_time, course_start_date;
```

### Check Created Classes

```sql
SELECT class_date, start_time, class_type, current_enrollment, max_capacity
FROM class_instances
WHERE class_date >= '2025-01-01'
ORDER BY class_date, start_time;
```

## 📁 Key Files

### Webhook System (Automated - Use This!)
- `server/index.js:4424` - Webhook endpoint `/api/shopify/webhook/orders`
- `server/utils/courseEnrollmentManager.js` - Main webhook logic
- `server/utils/courseScheduler.js` - Course parsing & class generation
- `server/utils/supabaseDb.js` - Database operations

### Manual Scripts (Deprecated)
- `create_classes_from_shopify.js` - Old manual class creation
- `create_bookings_from_shopify_orders.js` - Old manual booking creation
- `import-new-courses-jan-2025.js` - Old manual import

**Don't use these anymore!** Use the automated webhook system instead.

## ✅ Moving Forward

### For New Orders
No action needed! The webhook automatically:
1. Creates course enrollment when student purchases
2. Waits for 4+ students (Wheelthrowing)
3. Auto-creates classes and bookings when threshold met

### Manual Class Creation (Emergency Only)
If you need to manually create a class:

1. Go to Admin → Class Management
2. Click "Create Course"
3. Fill in all details including NUMBER OF CLASSES
4. System will create all class instances at once

## 🎓 Example: Saturday Course

**Shopify Product:**
- Title: "Wheelthrowing Beginner/Ext 6 Weeks"
- Variant: "SATURDAYS • 17 Jan – 21 Feb • 1:00pm-3:30pm"

**Automated Processing:**
1. Order comes in → Creates enrollment
2. Waits for 3 more students
3. When 4th student enrolls:
   - Creates 6 class instances: WT1701PM_DL6.1 through WT1701PM_DL6.6
   - Creates 24 bookings (4 students × 6 classes)
   - Updates all enrollments to confirmed

**Result:**
- Properly separated from 9:30am Saturday course
- Only students who bought 1:00pm are enrolled
- Classes created automatically when threshold met

## 🔧 Troubleshooting

### "Classes created but wrong students enrolled"
→ Run `node SETUP-AUTOMATED.js` to clean and re-import

### "Webhook not receiving orders"  
→ Check Shopify webhook settings and server deployment

### "Threshold not working"
→ Check `course_enrollments` table - verify `class_time` is populated

### "All times grouped together"
→ Old data before fix - run SETUP-AUTOMATED.js to clean up

## 📊 System Status Check

```bash
# Check if using automated system
node -e "const {supabase} = require('./utils/supabaseDb'); (async () => { const {count} = await supabase.from('course_enrollments').select('*', {count: 'exact', head: true}); console.log(count > 0 ? '✅ AUTOMATED MODE' : '❌ MANUAL MODE'); process.exit(0); })();"
```

---

**Questions?** Check the code or ask for help!
