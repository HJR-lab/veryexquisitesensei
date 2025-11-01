# Pottery Studio Management App - Product Requirements Document v1.0

**Last Updated:** October 13, 2025  
**Status:** Final - Ready for Development  
**Author:** Justin Long (Studio Owner)

---

## Executive Summary

A standalone web application for pottery studio management with:
- Student course management & class booking system
- Member studio access tracking with tiered benefits
- Pottery gallery with instant photo uploads
- Public gallery (customers only) with featured work
- Self-service class scheduling with waitlist management
- Comprehensive admin dashboard

---

## Table of Contents

1. [User Types & Access](#1-user-types--access)
2. [Core Features](#2-core-features)
3. [Technical Architecture](#3-technical-architecture)
4. [Database Schema](#4-database-schema)
5. [Email Notifications](#5-email-notifications)
6. [User Flows](#6-user-flows)
7. [Phase Implementation](#7-phase-implementation)
8. [Success Metrics](#8-success-metrics)
9. [Next Steps](#9-next-steps)

---

## 1. User Types & Access

### 1.1 Students

**Definition:** Customers who have purchased a 6-class pottery course

**Access & Capabilities:**
- Upload pottery photos (instant publish to gallery)
- View personal gallery with all completed pieces
- Book and change class times (self-service)
- Join class waitlists
- Google Calendar synchronization
- Opt pieces into public gallery
- Track course progress and expiry

**Course Details:**
- 6 classes total per course
- 3-month expiry from purchase date
- Must complete all classes within expiry period
- Can rebook with 24-hour advance notice

---

### 1.2 Members - Three Tiers

Members pay subscription fees for studio access without structured classes.

| Feature | Standard (1-Month) | Gold (6-Month) | Platinum (12-Month) |
|---------|-------------------|----------------|---------------------|
| **Studio Access** | ✅ | ✅ | ✅ |
| **Pottery Gallery** | ✅ | ✅ | ✅ |
| **Photo Upload** | ✅ | ✅ | ✅ |
| **Public Gallery** | ✅ | ✅ | ✅ |
| **Firing Discount** | 0% | 10% | **15%** |
| **Workshop Discount** | 0% | 10% | **15%** |
| **Badge** | Standard | Gold 🥇 | Platinum 🏆 |

**Member Capabilities:**
- Upload pottery photos (instant publish)
- View personal gallery
- Opt pieces into public gallery
- Track membership tier and benefits
- No class booking (open studio access)

---

### 1.3 Admin (Studio Owner/Staff)

**Capabilities:**
- Manage class schedules and capacity
- Mark attendance after each class
- Track no-shows and advance cancellations
- Add pieces directly to student/member galleries
- Feature pieces in public gallery (manual selection)
- View comprehensive analytics
- Manage waitlists and bookings
- Export data and reports
- Send notifications to students/members

---

### 1.4 Public/Customers

**Access Requirements:**
- **Login required** to view public gallery
- Only registered customers (students/members) can browse
- Not visible to general public

**Capabilities:**
- View public gallery (featured and all public pieces)
- Filter and search public pieces
- Social sharing of pieces
- Download/print options
- Click "Book a Class" CTAs

---

## 2. Core Features

## 2.1 Pottery Gallery

### 2.1.1 Photo Upload System

**Upload Process:**
- **Instant publish** - no admin review queue
- Upload 2-5 photos per piece
- Mobile-friendly camera interface
- Upload from device option
- Basic crop/rotate tools
- Progress indicator during upload

**Supported Formats:**
- JPG, PNG, HEIC
- Max file size: 10MB per image
- Auto-resize for web optimization

---

### 2.1.2 Piece Details Form

**Required Fields:**
- Title*
- Date Completed*
- Clay Type* (dropdown)

**Optional Fields:**
- Glazes (multi-select tags)
- Original Weight (kg)
- Final Weight (kg)
- Dimensions:
  - Height (cm)
  - Length (cm)
  - Width (cm)
- Notes/Description (rich text)
- Tags (comma-separated)
- Make Public (checkbox)

**Clay Type Options:**
- Stoneware
- Earthenware
- Porcelain
- Other (custom input)

**Validation:**
- Title: 3-100 characters
- Date: Cannot be future date
- Weights: Numeric, positive values
- Final weight should be less than original weight (warning if not)

---

### 2.1.3 Gallery View

**Layout:**
- Responsive grid
  - Desktop: 3 columns
  - Tablet: 2 columns
  - Mobile: 1 column
- Masonry-style layout for varied image heights

**Gallery Card Display:**
- Primary image (thumbnail)
- Piece title
- Completion date
- Clay type badge
- First 2-3 glazes (show "+X more" if additional)
- Hover effect with quick actions

**Features:**
- Search bar (real-time filtering)
  - Searches: title, clay type, glazes, tags, notes
  - Placeholder: "Search by title, clay type, glaze, or tags..."
- Filter buttons (auto-generated):
  - "All" (default)
  - By clay type (unique values from all pieces)
  - By tags (popular tags)
- Sort options:
  - Date (newest/oldest)
  - Title (A-Z)
  - Clay type
- Result count: "Showing X of Y pieces"
- Empty state: "No pottery pieces yet! Upload your first piece to get started."

---

### 2.1.4 Detailed Piece View

**Layout:**
- Two-column layout (desktop)
- Image section (left/top)
- Details section (right/bottom)

**Image Section:**
- Primary image display
- Image gallery/carousel (if multiple)
- Swipe support on mobile
- Zoom on click
- Navigation arrows
- Thumbnail strip

**Details Section:**

**Header:**
- Title (large, prominent)
- Completion date (formatted: "October 1, 2024")
- Edit/Delete buttons (own pieces only)

**Technical Specifications:**
- Clay Type (with icon/badge)
- Glazes (styled badges/chips)
- **Weight Section:**
  - Original weight: "2.5 kg"
  - Final weight: "2.1 kg"
  - Shrinkage calculation: `((original - final) / original * 100)%`
  - Display: "2.5 kg → 2.1 kg (16% shrinkage)"
  - Visual indicator (progress bar or graphic)
- **Dimensions:**
  - Height: 25 cm
  - Length: 15 cm
  - Width: 15 cm
  - Visual representation (optional)

**Additional Info:**
- Notes/description (full text)
- Tags (clickable, filters gallery)
- Public/Private status indicator
- Created date (metadata)

**Actions:**
- Back to gallery button
- Edit button
- Delete button (with confirmation)
- Share button (social media)
- Download button
- Print button
- Toggle Public/Private

---

### 2.1.5 Portfolio Stats Dashboard

Displayed at top of gallery page.

**Metrics Cards:**

1. **Total Pieces**
   - Count of all pieces
   - Icon: 🏺

2. **Most Used Clay**
   - Clay type used most frequently
   - Percentage of total
   - Icon: 🧱

3. **Total Clay Used**
   - Sum of all original weights
   - Display in kg
   - Icon: ⚖️

4. **Average Shrinkage**
   - Average shrinkage percentage across all pieces
   - Helpful for planning future projects
   - Icon: 📉

5. **Favorite Glaze**
   - Most frequently used glaze
   - Count of uses
   - Icon: 🎨

**Visual Style:**
- Card-based layout
- Icons for each metric
- Large numbers, small labels
- Subtle animations on load

---

## 2.2 Class Scheduling System (Students Only)

### 2.2.1 Course Rules & Constraints

**Course Details:**
- 6 classes total per course purchase
- **3-month expiry** from purchase date
- Countdown timer visible: "Course expires in 45 days"
- Email warnings sent at:
  - 30 days before expiry
  - 14 days before expiry
  - 7 days before expiry

**Booking Constraints:**
- Must complete all 6 classes before expiry
- Can only book classes with available vacancy
- Cannot book same time slot twice
- Can change booking up to **24 hours before class**
- Cannot book more than allocated sessions

---

### 2.2.2 My Classes Dashboard

**Upcoming Booked Classes Section:**

Each booked class displays:
- Date & day of week
- Start and end time
- Class type (e.g., "Wheel Throwing")
- Instructor name
- Studio location/room
- "Change Class" button (if >24 hours away)
- "Add to Google Calendar" button
- Countdown: "Starts in 2 days"

**Course Progress Widget:**
- Visual progress bar
- "Classes Used: 2 of 6"
- "Classes Forfeited: 1" (if applicable)
- "Classes Remaining: 3"
- Days until expiry: "45 days remaining"
- Expiry date: "Expires: January 15, 2025"
- Warning if <14 days: Red highlight

**Booking History:**
- Past completed classes
- Forfeited classes (with reason)
- Attendance record

---

### 2.2.3 Available Classes Calendar

**Calendar View:**
- Weekly grid layout
- Columns: Tue, Wed, Thu, Fri, Sat
- Rows: Time slots (e.g., 10 AM, 2 PM, 6 PM)

**Class Slot Display:**

Each slot shows:
```
Wheel Throwing
10:00 AM - 12:00 PM
with Sarah Chen
[5 spots left]
[Book Now] button
```

**If full:**
```
Hand Building
2:00 PM - 4:00 PM
with Sarah Chen
FULL
[Join Waitlist] button
```

**Visual Indicators:**
- Green: High availability (5+ spots)
- Yellow: Limited spots (2-4 spots)
- Red: Almost full (1 spot)
- Gray: Full (waitlist available)
- Disabled: Past dates

**Filter Options:**
- Class type (Wheel Throwing, Hand Building, Sculpture, etc.)
- Instructor
- Time of day (Morning, Afternoon, Evening)
- Day of week

---

### 2.2.4 Waitlist System

**When Class is Full:**
- "Join Waitlist" button appears
- Shows current waitlist length: "4 people ahead of you"

**After Joining Waitlist:**
- Confirmation message
- Shows position: "You're #5 on the waitlist"
- Can leave waitlist anytime
- Email confirmation sent

**When Spot Opens:**
- Email notification sent immediately
- **24-hour claim window** starts
- Link to claim spot in email
- Countdown timer in app: "Claim within 18 hours"
- Reminder email at 12 hours remaining

**If Spot Claimed:**
- Automatically books class
- Removes from waitlist
- Sends confirmation
- Updates course progress
- Option to add to Google Calendar

**If Spot Not Claimed:**
- Auto-expires after 24 hours
- Spot offered to next person in line
- Notification sent: "You missed your spot"

**Waitlist Management:**
- View all your waitlists
- Position tracking
- Estimated wait time (if available)
- Remove yourself from waitlist

---

### 2.2.5 No-Show Policy & Attendance

**Rules:**
- **Advance notice = 24 hours before class start**
- With advance notice: Class doesn't count, can rebook
- Without notice (no-show): **Class is forfeited**

**Student Experience:**

**With Advance Notice:**
1. Student cancels >24 hours before
2. Receives confirmation: "Class cancelled, you can rebook"
3. Class removed from "upcoming"
4. Classes remaining: unchanged
5. Can book another class

**No-Show (Without Notice):**
1. Student doesn't attend and didn't cancel
2. Admin marks as "no-show" after class
3. Student receives notification: "You missed your class"
4. Classes used: incremented
5. Classes forfeited: incremented
6. Display: "Classes Used: 3/6 (1 forfeited)"
7. Cannot recover forfeited class

**Tracking:**
- Clear distinction between:
  - Completed (attended)
  - Forfeited (no-show)
  - Cancelled (with notice)
- History shows all three types
- Warnings if pattern of no-shows

---

### 2.2.6 Class Change Flow

**Prerequisites:**
- Must be >24 hours before class
- Must have available classes to rebook into

**Step-by-Step Process:**

1. **Initiate Change:**
   - Click "Change Class" button
   - See current booking details

2. **Confirmation Dialog:**
   ```
   Change your Tuesday, Oct 15 class?
   
   This will free up your spot in:
   Wheel Throwing - Tuesday 10:00 AM
   
   You'll need to select a new class immediately.
   
   [Cancel] [Continue]
   ```

3. **View Available Classes:**
   - Shows calendar of available slots
   - Excludes slots you've already booked
   - Highlights best alternatives

4. **Select New Class:**
   - Click on desired time slot
   - See class details

5. **Confirm New Booking:**
   ```
   Book this class?
   
   Hand Building - Thursday 2:00 PM
   with Sarah Chen
   3 spots remaining
   
   [Go Back] [Confirm Booking]
   ```

6. **Confirmation:**
   - Success message
   - Email confirmation sent
   - Old class removed from calendar
   - New class added to calendar
   - Google Calendar automatically updated

**Constraints:**
- If <24 hours: "Too late to change. Please contact studio."
- If no available alternatives: "No other classes available with vacancy"
- If course expired: Cannot book new classes

---

### 2.2.7 Google Calendar Integration

**For Students:**

**Initial Booking:**
- "Add to Google Calendar" button on confirmation
- One-click calendar export
- Generates .ics file with:
  - Event title: "Pottery Class - [Type]"
  - Date & time
  - Location: Studio address with map link
  - Description: Instructor, room, class details
  - Reminder: 24 hours before
  - Reminder: 1 hour before

**Auto-Update on Changes:**
- Old event automatically removed
- New event automatically added
- No manual intervention needed

**Calendar Event Format:**
```
Title: Pottery Class - Wheel Throwing
When: Tuesday, Oct 15, 2024, 10:00 AM - 12:00 PM
Where: Pottery Studio, [Address]
Description:
  Instructor: Sarah Chen
  Room: Main Studio
  What to bring: Apron, towel
  [Link to studio website]
Reminders:
  - 1 day before
  - 1 hour before
```

**For Admin:**
- Master calendar showing all classes
- Color-coded by class type
- Shows enrollment in event description
- Syncs to studio Google Calendar
- Real-time updates as students book

---

## 2.3 Admin - Class Management

### 2.3.1 Create Recurring Class Schedule

**Schedule Setup Form:**

```
Class Type: [Wheel Throwing ▼]
Instructor: [Sarah Chen ▼]
Studio Room: [Main Studio ▼]

Recurring Schedule:
☑ Tuesday    Time: 10:00 AM - 12:00 PM    Capacity: [8]
☑ Wednesday  Time: 10:00 AM - 12:00 PM    Capacity: [8]
☑ Thursday   Time: 2:00 PM - 4:00 PM      Capacity: [6]
☑ Friday     Time: 6:00 PM - 8:00 PM      Capacity: [10]
☑ Saturday   Time: 10:00 AM - 12:00 PM    Capacity: [10]

Start Date: [Oct 1, 2024]
End Date: ○ Ongoing  ○ Specific date: [___]

[Save Schedule]
```

**Class Types (Configurable):**
- Wheel Throwing
- Hand Building
- Sculpture
- Glazing Workshop
- Firing Workshop
- Open Studio
- Custom (add new)

**Features:**
- Multiple time slots per day
- Different capacities per slot
- Copy schedule to multiple weeks
- Bulk edit capacity
- Holiday exclusions

---

### 2.3.2 Class Dashboard

**Overview Metrics:**

Top of page shows:
- **This Week's Classes:** 24
- **Total Bookings:** 156
- **Capacity Utilization:** 87%
- **Waitlisted Students:** 12

**Upcoming Classes (Next 7 Days):**

Table view with columns:
- Date/Time
- Class Type
- Instructor
- Enrolled/Capacity (e.g., "7/8")
- Waitlist count
- Actions (View Roster, Edit, Cancel)

**Visual Indicators:**
- ✅ Green: Good enrollment (75%+ capacity)
- ⚠️ Yellow: Low enrollment (<50% capacity)
- 🔴 Red: Needs attention (0 enrollment, or past date)
- 🎉 Full: At capacity

**Quick Actions:**
- Add single class
- Cancel class
- Send class reminder
- Export week's schedule

---

### 2.3.3 Class Roster View

**Per-Class Roster:**

**Header:**
```
Wheel Throwing - Tuesday, Oct 15, 2024
10:00 AM - 12:00 PM | Main Studio
Instructor: Sarah Chen
Enrolled: 7/8 | Waitlist: 3
```

**Student List:**

Table with columns:
- Student Name
- Email
- Course Progress (e.g., "2/6 classes")
- Booking Date
- Actions (Contact, Remove)

**Bulk Actions:**
- Email all students
- Export roster to CSV
- Print roster
- Add note to all

**Waitlist Section:**
```
Waitlist (3 students)
1. John Doe - john@email.com
2. Jane Smith - jane@email.com
3. Mike Johnson - mike@email.com

[Increase Capacity] to accommodate waitlist
```

---

### 2.3.4 Attendance Marking

**After Each Class:**

Admin opens class roster and marks attendance:

**Attendance Options for Each Student:**
```
[ ] Present
[ ] No-Show (with advance notice)
[ ] No-Show (without notice) ⚠️
```

**Interface:**
```
Wheel Throwing - Tuesday, Oct 15, 2024
Mark Attendance:

✅ Sarah Johnson    [Present ▼]
✅ Mike Chen        [Present ▼]
⚠️ John Doe         [No-Show (no notice) ▼]
✅ Jane Smith       [Present ▼]
...

Notes: [Optional class notes]

[Save Attendance]
```

**Auto-Actions on Save:**

**If Present:**
- Increment classes_used
- Send confirmation: "Thanks for attending!"

**If No-Show with Notice:**
- Do NOT increment classes_used
- Mark as cancelled
- Student can rebook

**If No-Show without Notice:**
- Increment classes_used
- Increment classes_forfeited
- Send notification: "You missed your class"
- Cannot recover

**Bulk Attendance:**
- "Mark All Present" quick action
- Individual overrides

---

### 2.3.5 Modify & Manage Classes

**Edit Class:**
- Change capacity (increase/decrease)
- Change time
- Change instructor
- Change room
- Add notes/special requirements

**Cancel Class:**
1. Select class to cancel
2. Reason: [dropdown or text]
   - Instructor unavailable
   - Maintenance
   - Low enrollment
   - Other
3. Notification preview:
   ```
   All 7 enrolled students will be notified:
   "Your Tuesday 10 AM class has been cancelled.
    Reason: Instructor unavailable
    Please rebook at your convenience."
   ```
4. Confirm cancellation
5. Students auto-notified via email
6. Classes returned to their balance
7. Calendar events removed

**Block Dates (Holidays):**
- Select date range
- All classes on those dates hidden
- Students cannot book
- Existing bookings cancelled with notice

**Capacity Management:**
- Increase capacity: Automatically offers spot to waitlist
- Decrease capacity: Must handle if over-enrolled

---

### 2.3.6 Waitlist Management

**Waitlist Dashboard:**

View all waitlists across all classes:

```
Class                        Students    Next Action
─────────────────────────────────────────────────────
Wheel Throwing - Tue 10 AM   5           Spot opens: 18 hrs
Hand Building - Wed 2 PM     3           All notified
Sculpture - Fri 6 PM         8           Contact studio
```

**Per-Waitlist View:**

```
Wheel Throwing - Tuesday 10:00 AM
Class Date: Oct 22, 2024
Capacity: 8/8 (Full)

Waitlist (5 students):
1. ⏳ John Doe - Offered spot, expires in 18 hours
2. 🕐 Jane Smith - Joined 2 days ago
3. 🕐 Mike Johnson - Joined 5 hours ago
4. 🕐 Sarah Lee - Joined 1 hour ago
5. 🕐 Tom Brown - Joined 30 min ago

Actions:
[Increase Capacity] [Email Waitlist] [Clear Waitlist]
```

**Manual Override:**
- Bump student up in position
- Offer spot directly
- Remove from waitlist
- Notify manually

---

### 2.3.7 Analytics & Reports

**Dashboard Metrics:**

**Utilization:**
- Class capacity utilization over time (graph)
- Most popular time slots
- Least popular time slots
- Day of week analysis

**Student Behavior:**
- Average classes per student
- Course completion rate
- No-show rate
- Change/cancellation rate
- Time to book first class

**Operational:**
- Total classes offered
- Total bookings
- Waitlist conversion rate
- Revenue per class type

**Export Options:**
- CSV export
- PDF report
- Date range selection
- Filter by class type, instructor

---

## 2.4 Public Gallery

### 2.4.1 Access & Privacy

**Access Requirements:**
- **Login required** - only registered customers
- Not visible to general public
- Must be student or member to view
- Shareable links require login

**Privacy Model:**
- Default: All pieces are private
- Students/members opt-in per piece
- Clear consent checkbox: "Make this piece public"
- Can toggle public/private anytime
- Consent text:
  ```
  ☐ Make this piece public
  
  By making this public, your piece may be displayed in the 
  studio's customer gallery and may be featured in marketing 
  materials. Your first name will be shown, but no other 
  personal information.
  ```

---

### 2.4.2 Public Gallery Layout

**Homepage:**

**Featured Work Carousel (Hero Section):**
- Large hero section at top
- 3-5 manually selected pieces
- Auto-rotating carousel (5 seconds)
- Full-bleed images
- Overlay text:
  - Piece title
  - Creator: "By [First Name]"
  - "View Details" button
- Manual navigation arrows
- Dot indicators

**Gallery Grid:**
- Masonry layout (like Pinterest)
- High-quality images featured prominently
- Minimal text overlay
- Hover effect shows:
  - Title
  - Creator name
  - Quick view button

**Professional Aesthetic:**
- Clean, minimal design
- White/cream background
- Earth tone accents
- Focus on the ceramics
- High-quality image display

---

### 2.4.3 What's Shown Publicly

**Visible Information:**
- ✅ All photos of the piece
- ✅ Title
- ✅ Clay type
- ✅ Glazes used
- ✅ Techniques (from tags)
- ✅ Style tags
- ✅ Creator: "By [First Name]" only
- ✅ Date completed (month/year only)

**Hidden Information:**
- ❌ Full name
- ❌ Email
- ❌ Contact information
- ❌ Weights (technical details)
- ❌ Dimensions (technical details)
- ❌ Personal notes
- ❌ Any identifying information beyond first name

---

### 2.4.4 Public Gallery Features

**Filtering:**
- Technique:
  - Wheel-thrown
  - Hand-built
  - Sculpture
  - Functional
  - Decorative
- Clay Type:
  - Stoneware
  - Earthenware
  - Porcelain
  - Mixed
- Style/Tags:
  - Modern
  - Traditional
  - Rustic
  - Minimalist
  - Colorful
- Creator Type:
  - Student work
  - Member work
  - Featured pieces

**Search:**
- Search by title
- Search by tags
- Search by clay type
- Real-time results

**Sorting:**
- Newest first (default)
- Oldest first
- Recently featured
- Most viewed (future)

**Result Count:**
- "Showing 24 pieces"
- Load more / pagination

---

### 2.4.5 Piece Detail View (Public)

**Layout:**
- Large image gallery (primary focus)
- Limited info sidebar

**What's Shown:**
```
[Image Gallery/Carousel]

Celadon Vase
By Sarah

─────────────────

Clay: Stoneware
Glazes: Celadon Green, Clear Gloss
Techniques: Wheel-thrown, Carved detail
Completed: October 2024

─────────────────

[Share] [Download] [Print]

─────────────────

Inspired by this piece?
[Book a Pottery Class]
```

**Actions:**
- **Share:** Facebook, Twitter, Pinterest, Email, Copy link
- **Download:** High-res image (with watermark)
- **Print:** Printer-friendly version
- **Book a Class:** CTA to course purchase page

---

### 2.4.6 Featured Work System

**Admin Controls:**

**Feature Piece Interface:**
```
Feature in Public Gallery

Current Featured Pieces (5):
1. [Thumbnail] Celadon Vase by Sarah    [Remove] [Move Up/Down]
2. [Thumbnail] Rustic Bowl by Mike      [Remove] [Move Up/Down]
3. [Thumbnail] Tea Set by Jane          [Remove] [Move Up/Down]
4. [Thumbnail] Sculpture by Tom         [Remove] [Move Up/Down]
5. [Thumbnail] Platter by Emma          [Remove] [Move Up/Down]

[Add Featured Piece]
```

**Adding Featured Piece:**
1. Browse all public pieces
2. Select piece
3. Set feature order (1-5 for carousel)
4. Optional: Add feature note (internal)
5. Save

**Feature Badge:**
- Pieces get "⭐ Featured" badge
- Displayed prominently in gallery
- Creator notified via email:
  ```
  Congratulations! Your piece "Celadon Vase" has been 
  featured in our public gallery. Great work!
  ```

**Auto-Rotation Option (Future):**
- Auto-feature newest public pieces
- Rotate every week
- Admin can override

---

### 2.4.7 Call-to-Action Integration

**Throughout Public Gallery:**

**After Browsing Several Pieces:**
```
╔═══════════════════════════════════════╗
║  Inspired by what you see?            ║
║                                       ║
║  Join our pottery classes and create  ║
║  your own beautiful ceramics!         ║
║                                       ║
║  [Book a 6-Class Course - $450]       ║
║                                       ║
║  or                                   ║
║                                       ║
║  [Become a Studio Member]             ║
╚═══════════════════════════════════════╝
```

**On Piece Detail Page:**
```
Love this style?
Learn the techniques in our classes!
[Book a Class]
```

**Placement:**
- After every 12 pieces in grid
- On every piece detail page
- In gallery sidebar
- Exit intent popup (considerate timing)

---

## 2.5 Membership Tier System

### 2.5.1 Tier Definitions

| Feature | Standard (1-Month) | Gold (6-Month) | Platinum (12-Month) |
|---------|-------------------|----------------|---------------------|
| **Duration** | 1 month | 6 months | 12 months |
| **Studio Access** | ✅ Open studio hours | ✅ Open studio hours | ✅ Open studio hours |
| **Pottery Gallery** | ✅ Unlimited uploads | ✅ Unlimited uploads | ✅ Unlimited uploads |
| **Public Gallery** | ✅ Opt-in available | ✅ Opt-in available | ✅ Opt-in available |
| **Firing Discount** | 0% | **10%** | **15%** |
| **Workshop Discount** | 0% | **10%** | **15%** |
| **Profile Badge** | Standard 🔵 | Gold 🥇 | Platinum 🏆 |
| **Priority Support** | Standard | Priority email | Priority email + phone |

### 2.5.2 Perks Display

**Member Dashboard - Perks Widget:**

**For Gold Member:**
```
╔════════════════════════════════════╗
║  Your Gold Membership Benefits     ║
║                                    ║
║  🥇 Gold Member Badge              ║
║  🔥 10% off all firing fees        ║
║  🎨 10% off all workshops          ║
║  📅 Membership expires: Apr 1, 25  ║
║                                    ║
║  Savings this month: $45           ║
╚════════════════════════════════════╝
```

**For Platinum Member:**
```
╔════════════════════════════════════╗
║  Your Platinum Membership Benefits ║
║                                    ║
║  🏆 Platinum Member Badge          ║
║  🔥 15% off all firing fees        ║
║  🎨 15% off all workshops          ║
║  ⭐ Priority support access        ║
║  📅 Membership expires: Oct 1, 25  ║
║                                    ║
║  Savings this year: $320           ║
╚════════════════════════════════════╝
```

**For Standard Member:**
```
╔════════════════════════════════════╗
║  Your Standard Membership          ║
║                                    ║
║  🔵 Full studio access             ║
║  📸 Upload to gallery              ║
║  📅 Renews: Nov 1, 2024            ║
║                                    ║
║  ✨ Upgrade to Gold or Platinum    ║
║     for discounts and perks!       ║
║                                    ║
║  [View Upgrade Options]            ║
╚════════════════════════════════════╝
```

---

### 2.5.3 Tier Display Throughout App

**Profile Badge:**
- Displayed next to member name everywhere
- Standard: Blue circle 🔵
- Gold: Gold medal 🥇
- Platinum: Trophy 🏆

**Gallery:**
- Badge shown on member's pieces
- "Gold Member" or "Platinum Member" tag

**Public Gallery:**
- Badge visible on public pieces
- Subtle, professional display

---

### 2.5.4 Discount Application

**Firing Fees:**
- Applied automatically at checkout
- Display: "Firing fee: $50 ~~$50~~ $42.50 (15% Platinum discount)"
- Track total savings

**Workshop Registration:**
- Applied at workshop booking
- Display: "Workshop: $80 ~~$80~~ $68 (15% Platinum discount)"
- Track total savings

**Savings Tracker:**
- Dashboard widget showing:
  - "You've saved $125 this month with Platinum benefits"
  - "Total lifetime savings: $850"

---

### 2.5.5 Membership Renewal

**Renewal Reminders:**
- Email at 7 days before expiry
- Email at 1 day before expiry
- In-app banner when <7 days

**Renewal Flow:**
1. Click "Renew Membership"
2. See current tier and option to upgrade
3. Process payment via Shopify
4. Instant renewal confirmation
5. Updated expiry date

**Auto-Renewal (Optional Future Feature):**
- Opt-in to auto-renew
- Email 7 days before charge
- Can cancel anytime

---

## 3. Technical Architecture

### 3.1 Recommended Technology Stack

**Frontend:**
- **Framework:** React 18+ or Next.js 14+
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** React Context + Hooks (or Zustand)
- **Forms:** React Hook Form + Zod validation
- **Date/Time:** date-fns or Day.js
- **Image Upload:** react-dropzone
- **Image Display:** react-image-gallery
- **Calendar:** FullCalendar or custom
- **Charts:** Recharts or Chart.js

**Backend:**
- **Runtime:** Node.js 20+
- **Framework:** Express.js or Fastify
- **Language:** TypeScript
- **API Style:** RESTful API
- **Authentication:** JWT + Shopify OAuth
- **File Upload:** Multer
- **Image Processing:** Sharp

**Database:**
- **Primary:** PostgreSQL 15+
- **ORM:** Prisma or Drizzle
- **Migrations:** Built-in ORM migrations
- **Backup:** Automated daily backups

**File Storage:**
- **Images:** AWS S3 or Cloudinary
- **CDN:** CloudFront or Cloudinary CDN
- **Optimization:** Auto-resize, WebP conversion

**External Services:**
- **Shopify API:** For customer data sync
- **Google Calendar API:** For calendar integration
- **SendGrid/Resend:** For email notifications
- **Stripe:** For payment processing (if needed)

**Hosting & Infrastructure:**
- **Frontend:** Vercel or Netlify
- **Backend:** Railway, Render, or AWS
- **Database:** Managed PostgreSQL (Railway, Supabase, or AWS RDS)
- **Environment:** Staging + Production

**Development Tools:**
- **Version Control:** Git + GitHub
- **Package Manager:** pnpm or npm
- **Linting:** ESLint + Prettier
- **Testing:** Vitest + React Testing Library
- **API Testing:** Postman or Bruno

---

### 3.2 System Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │  Student   │  │   Member   │  │   Admin    │   │
│  │  Portal    │  │   Portal   │  │  Dashboard │   │
│  └────────────┘  └────────────┘  └────────────┘   │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ HTTPS/REST API
                        │
┌───────────────────────▼─────────────────────────────┐
│              Backend API (Node.js)                   │
│  ┌──────────────────────────────────────────────┐  │
│  │  Authentication (JWT + Shopify OAuth)         │  │
│  ├──────────────────────────────────────────────┤  │
│  │  Gallery Service                              │  │
│  │  - Upload photos                              │  │
│  │  - Manage pieces                              │  │
│  ├──────────────────────────────────────────────┤  │
│  │  Scheduling Service                           │  │
│  │  - Class management                           │  │
│  │  - Booking logic                              │  │
│  │  - Waitlist management                        │  │
│  ├──────────────────────────────────────────────┤  │
│  │  Notification Service                         │  │
│  │  - Email triggers                             │  │
│  │  - Calendar sync                              │  │
│  └──────────────────────────────────────────────┘  │
└─────────┬────────────────┬────────────────┬────────┘
          │                │                │
          │                │                │
┌─────────▼────┐  ┌────────▼──────┐  ┌─────▼─────────┐
│  PostgreSQL  │  │  Shopify API  │  │  AWS S3/      │
│  Database    │  │  (Customers)  │  │  Cloudinary   │
│              │  │               │  │  (Images)     │
└──────────────┘  └───────────────┘  └───────────────┘
                          
┌─────────────────────────────────────────────────────┐
│              External Services                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │   SendGrid   │  │    Google    │  │  Stripe  │ │
│  │   (Email)    │  │   Calendar   │  │ (Future) │ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────┘
```

---

### 3.3 Authentication Flow

**Shopify OAuth Integration:**

1. User clicks "Login with Shopify"
2. Redirect to Shopify OAuth page
3. User logs in with Shopify credentials
4. Shopify redirects back with authorization code
5. Backend exchanges code for access token
6. Fetch customer data from Shopify API
7. Check if customer exists in local DB
8. If not, create customer record
9. Generate JWT token
10. Return JWT to frontend
11. Frontend stores JWT in httpOnly cookie
12. All subsequent requests include JWT

**JWT Token Contains:**
```json
{
  "customer_id": "123",
  "shopify_id": "gid://shopify/Customer/456",
  "email": "student@example.com",
  "customer_type": "student",
  "membership_tier": "gold",
  "exp": 1234567890
}
```

**Session Management:**
- JWT expires after 7 days
- Refresh token for extended sessions
- Logout clears cookie and invalidates token

---

### 3.4 Shopify Integration Details

**Data Synced from Shopify:**
- Customer ID (primary link)
- Email
- Name (first_name, last_name)
- Customer tags (to determine student/member status)
- Order history (for course purchases)
- Metafields (for membership tier info)

**Sync Strategy:**
- Initial sync on first login
- Webhook for real-time updates (when customer data changes)
- Daily batch sync for reconciliation

**Shopify Webhooks Needed:**
```
customers/create
customers/update
orders/create (for new course purchases)
```

**Shopify Customer Tags:**
```
pottery-student
pottery-member-standard
pottery-member-gold
pottery-member-platinum
```

---

### 3.5 API Endpoints Structure

**Authentication:**
```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
```

**Gallery:**
```
GET    /api/gallery/pieces          # Get user's pieces
GET    /api/gallery/pieces/:id      # Get single piece
POST   /api/gallery/pieces          # Upload new piece
PUT    /api/gallery/pieces/:id      # Update piece
DELETE /api/gallery/pieces/:id      # Delete piece
GET    /api/gallery/public          # Get public gallery
GET    /api/gallery/featured        # Get featured pieces
POST   /api/gallery/upload-image    # Upload image to S3
```

**Classes (Student):**
```
GET    /api/classes/available       # Get available classes
GET    /api/classes/my-bookings     # Get student's bookings
POST   /api/classes/book            # Book a class
PUT    /api/classes/change/:id      # Change booking
DELETE /api/classes/cancel/:id      # Cancel booking
GET    /api/classes/waitlist        # Get student's waitlists
POST   /api/classes/waitlist/join   # Join waitlist
DELETE /api/classes/waitlist/:id    # Leave waitlist
POST   /api/classes/waitlist/claim  # Claim waitlist spot
```

**Classes (Admin):**
```
GET    /api/admin/classes                    # Get all classes
POST   /api/admin/classes                    # Create class
PUT    /api/admin/classes/:id                # Update class
DELETE /api/admin/classes/:id                # Delete class
GET    /api/admin/classes/:id/roster         # Get class roster
POST   /api/admin/classes/:id/attendance     # Mark attendance
GET    /api/admin/classes/schedule           # Get schedule
POST   /api/admin/classes/recurring          # Create recurring
```

**Students (Admin):**
```
GET    /api/admin/students              # Get all students
GET    /api/admin/students/:id          # Get student details
GET    /api/admin/students/:id/progress # Get course progress
POST   /api/admin/students/:id/pieces   # Add piece to student
```

**Members (Admin):**
```
GET    /api/admin/members           # Get all members
GET    /api/admin/members/:id       # Get member details
POST   /api/admin/members/:id/pieces # Add piece to member
```

**Analytics:**
```
GET    /api/admin/analytics/overview
GET    /api/admin/analytics/classes
GET    /api/admin/analytics/students
GET    /api/admin/analytics/members
```

**Notifications:**
```
POST   /api/notifications/send      # Manual notification
GET    /api/notifications/templates # Email templates
```

---

### 3.6 Security Considerations

**Authentication:**
- JWT tokens with short expiration
- HttpOnly cookies (prevent XSS)
- CSRF protection
- Rate limiting on auth endpoints

**Authorization:**
- Role-based access control (student/member/admin)
- Resource ownership checks
- Admin-only endpoints protected

**Data Protection:**
- All passwords hashed (bcrypt)
- Sensitive data encrypted at rest
- HTTPS only
- Input validation and sanitization
- SQL injection prevention (ORM)
- XSS protection

**File Upload:**
- File type validation (images only)
- File size limits (10MB)
- Virus scanning (optional)
- Signed URLs for S3 access
- CDN with auth for private images

**API Security:**
- Rate limiting (100 req/min per user)
- Request validation (Zod schemas)
- Error handling (no sensitive info leaked)
- CORS configuration
- API versioning

---

## 4. Database Schema

### 4.1 Core Tables

**customers**
```sql
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  shopify_customer_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  customer_type VARCHAR(20) NOT NULL, -- 'student', 'member', 'both'
  
  -- Student fields
  course_purchase_date TIMESTAMP,
  course_expiry_date TIMESTAMP,
  classes_allocated INTEGER DEFAULT 6,
  classes_used INTEGER DEFAULT 0,
  classes_forfeited INTEGER DEFAULT 0,
  
  -- Member fields
  membership_tier VARCHAR(20), -- 'standard', 'gold', 'platinum'
  membership_start_date TIMESTAMP,
  membership_end_date TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_synced_at TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_shopify_id (shopify_customer_id),
  INDEX idx_customer_type (customer_type)
);
```

---

**pottery_pieces**
```sql
CREATE TABLE pottery_pieces (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Basic info
  title VARCHAR(200) NOT NULL,
  date_completed DATE NOT NULL,
  notes TEXT,
  
  -- Technical details
  clay_type VARCHAR(50) NOT NULL,
  glazes JSONB DEFAULT '[]', -- array of glaze names
  original_weight DECIMAL(10,2), -- in kg
  final_weight DECIMAL(10,2), -- in kg
  shrinkage_percent DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN original_weight > 0 AND final_weight > 0 
      THEN ((original_weight - final_weight) / original_weight * 100)
      ELSE NULL
    END
  ) STORED,
  
  -- Dimensions (in cm)
  height DECIMAL(10,2),
  length DECIMAL(10,2),
  width DECIMAL(10,2),
  
  -- Images
  images JSONB NOT NULL DEFAULT '[]', -- array of image URLs
  
  -- Organization
  tags JSONB DEFAULT '[]', -- array of tag strings
  
  -- Visibility
  is_public BOOLEAN DEFAULT FALSE,
  featured BOOLEAN DEFAULT FALSE,
  featured_order INTEGER,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_customer_id (customer_id),
  INDEX idx_date_completed (date_completed),
  INDEX idx_clay_type (clay_type),
  INDEX idx_is_public (is_public),
  INDEX idx_featured (featured, featured_order)
);
```

---

**class_templates**
```sql
CREATE TABLE class_templates (
  id SERIAL PRIMARY KEY,
  
  -- Schedule
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 6=Sat
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Class info
  class_type VARCHAR(100) NOT NULL,
  instructor VARCHAR(100) NOT NULL,
  room VARCHAR(100),
  max_capacity INTEGER NOT NULL CHECK (max_capacity > 0),
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_day_of_week (day_of_week),
  INDEX idx_active (active)
);
```

---

**class_instances**
```sql
CREATE TABLE class_instances (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES class_templates(id) ON DELETE SET NULL,
  
  -- Date and time
  class_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Class info (denormalized for flexibility)
  class_type VARCHAR(100) NOT NULL,
  instructor VARCHAR(100) NOT NULL,
  room VARCHAR(100),
  max_capacity INTEGER NOT NULL,
  current_enrollment INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'cancelled', 'completed'
  cancellation_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_class_date (class_date),
  INDEX idx_template_id (template_id),
  INDEX idx_status (status),
  UNIQUE (class_date, start_time, room) -- Prevent double-booking room
);
```

---

**bookings**
```sql
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  class_instance_id INTEGER NOT NULL REFERENCES class_instances(id) ON DELETE CASCADE,
  
  -- Booking info
  booking_date TIMESTAMP DEFAULT NOW(),
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'booked', -- 'booked', 'cancelled', 'completed', 'forfeited'
  advance_notice_given BOOLEAN DEFAULT FALSE,
  attended BOOLEAN,
  
  -- Attendance
  marked_by_admin_id INTEGER REFERENCES customers(id),
  attendance_marked_at TIMESTAMP,
  attendance_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_student_id (student_id),
  INDEX idx_class_instance_id (class_instance_id),
  INDEX idx_status (status),
  INDEX idx_booking_date (booking_date),
  UNIQUE (student_id, class_instance_id) -- Prevent double-booking
);
```

---

**waitlist**
```sql
CREATE TABLE waitlist (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  class_instance_id INTEGER NOT NULL REFERENCES class_instances(id) ON DELETE CASCADE,
  
  -- Position tracking
  position INTEGER NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  
  -- Notification tracking
  spot_offered_at TIMESTAMP,
  notification_sent_at TIMESTAMP,
  expires_at TIMESTAMP,
  
  -- Claim status
  claimed BOOLEAN DEFAULT FALSE,
  claimed_at TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_student_id (student_id),
  INDEX idx_class_instance_id (class_instance_id),
  INDEX idx_position (class_instance_id, position),
  INDEX idx_expires_at (expires_at),
  UNIQUE (student_id, class_instance_id) -- One waitlist entry per class
);
```

---

**notifications**
```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Notification details
  type VARCHAR(50) NOT NULL, -- 'course_expiry', 'waitlist_spot', 'class_reminder', etc.
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  
  -- Delivery
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMP,
  email_opened BOOLEAN DEFAULT FALSE,
  
  -- Status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  
  -- Related entities
  related_class_instance_id INTEGER REFERENCES class_instances(id),
  related_booking_id INTEGER REFERENCES bookings(id),
  related_piece_id INTEGER REFERENCES pottery_pieces(id),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_customer_id (customer_id),
  INDEX idx_type (type),
  INDEX idx_read (read),
  INDEX idx_created_at (created_at)
);
```

---

### 4.2 Helper Tables

**clay_types** (Reference table)
```sql
CREATE TABLE clay_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pre-populate
INSERT INTO clay_types (name) VALUES 
  ('Stoneware'),
  ('Earthenware'),
  ('Porcelain'),
  ('Other');
```

---

**glazes** (Reference table)
```sql
CREATE TABLE glazes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  color_hex VARCHAR(7), -- e.g., '#3B82F6'
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

**admin_settings** (Configuration)
```sql
CREATE TABLE admin_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Pre-populate
INSERT INTO admin_settings (setting_key, setting_value, description) VALUES
  ('classes_per_course', '6', 'Number of classes in a standard course'),
  ('course_duration_days', '90', 'Days until course expires'),
  ('change_cutoff_hours', '24', 'Hours before class that changes are allowed'),
  ('waitlist_claim_hours', '24', 'Hours to claim a waitlist spot'),
  ('max_images_per_piece', '5', 'Maximum images per pottery piece'),
  ('gold_firing_discount', '10', 'Gold member firing discount %'),
  ('gold_workshop_discount', '10', 'Gold member workshop discount %'),
  ('platinum_firing_discount', '15', 'Platinum member firing discount %'),
  ('platinum_workshop_discount', '15', 'Platinum member workshop discount %');
```

---

### 4.3 Database Views

**student_progress_view** (For easy querying)
```sql
CREATE VIEW student_progress_view AS
SELECT 
  c.id,
  c.email,
  c.first_name,
  c.last_name,
  c.course_purchase_date,
  c.course_expiry_date,
  c.classes_allocated,
  c.classes_used,
  c.classes_forfeited,
  (c.classes_allocated - c.classes_used) AS classes_remaining,
  CASE 
    WHEN c.course_expiry_date < NOW() THEN 'expired'
    WHEN c.course_expiry_date < NOW() + INTERVAL '7 days' THEN 'expiring_soon'
    ELSE 'active'
  END AS course_status,
  (SELECT COUNT(*) FROM bookings b WHERE b.student_id = c.id AND b.status = 'booked') AS upcoming_classes,
  (SELECT COUNT(*) FROM waitlist w WHERE w.student_id = c.id AND w.claimed = FALSE) AS active_waitlists
FROM customers c
WHERE c.customer_type IN ('student', 'both');
```

---

**class_capacity_view** (For admin dashboard)
```sql
CREATE VIEW class_capacity_view AS
SELECT 
  ci.id,
  ci.class_date,
  ci.start_time,
  ci.end_time,
  ci.class_type,
  ci.instructor,
  ci.max_capacity,
  ci.current_enrollment,
  (ci.max_capacity - ci.current_enrollment) AS spots_available,
  ROUND((ci.current_enrollment::DECIMAL / ci.max_capacity * 100), 2) AS utilization_percent,
  (SELECT COUNT(*) FROM waitlist w WHERE w.class_instance_id = ci.id AND w.claimed = FALSE) AS waitlist_count,
  CASE 
    WHEN ci.current_enrollment >= ci.max_capacity THEN 'full'
    WHEN ci.current_enrollment >= ci.max_capacity * 0.75 THEN 'high'
    WHEN ci.current_enrollment >= ci.max_capacity * 0.5 THEN 'medium'
    ELSE 'low'
  END AS enrollment_level
FROM class_instances ci
WHERE ci.status = 'active' AND ci.class_date >= CURRENT_DATE;
```

---

### 4.4 Database Indexes

Critical indexes for performance:

```sql
-- Composite indexes for common queries
CREATE INDEX idx_bookings_student_status ON bookings(student_id, status);
CREATE INDEX idx_bookings_class_status ON bookings(class_instance_id, status);
CREATE INDEX idx_pieces_customer_public ON pottery_pieces(customer_id, is_public);
CREATE INDEX idx_pieces_public_featured ON pottery_pieces(is_public, featured, featured_order);
CREATE INDEX idx_waitlist_class_position ON waitlist(class_instance_id, position) WHERE claimed = FALSE;

-- Full-text search indexes
CREATE INDEX idx_pieces_title_search ON pottery_pieces USING GIN(to_tsvector('english', title));
CREATE INDEX idx_pieces_notes_search ON pottery_pieces USING GIN(to_tsvector('english', notes));

-- JSONB indexes
CREATE INDEX idx_pieces_tags ON pottery_pieces USING GIN(tags);
CREATE INDEX idx_pieces_glazes ON pottery_pieces USING GIN(glazes);
```

---

## 5. Email Notifications

### 5.1 Notification Types

**Student Notifications:**

1. **Course Expiry Warnings**
   - Trigger: 30, 14, 7 days before expiry
   - Subject: "Your pottery course expires in [X] days"
   - Content: Classes remaining, link to book

2. **Class Booking Confirmation**
   - Trigger: Immediately after booking
   - Subject: "Class booked: [Class Type] on [Date]"
   - Content: Class details, calendar link, change/cancel link

3. **Class Change Confirmation**
   - Trigger: After changing class
   - Subject: "Class changed to [Date]"
   - Content: New class details, calendar update

4. **Class Reminder**
   - Trigger: 24 hours before class
   - Subject: "Reminder: Your pottery class tomorrow"
   - Content: What to bring, directions, instructor

5. **Waitlist Spot Available**
   - Trigger: When spot opens
   - Subject: "A spot opened in [Class]!"
   - Content: Claim link, 24-hour deadline, countdown

6. **Waitlist Spot Claimed**
   - Trigger: After claiming spot
   - Subject: "You're in! Class confirmed"
   - Content: Class details, calendar link

7. **Waitlist Spot Expired**
   - Trigger: After 24-hour window
   - Subject: "You missed your spot in [Class]"
   - Content: Browse other available classes

8. **No-Show Notification**
   - Trigger: After admin marks no-show
   - Subject: "You missed your pottery class"
   - Content: Class marked forfeited, book future classes

9. **Piece Published**
   - Trigger: After uploading piece (instant)
   - Subject: "Your [Piece Title] is in your gallery!"
   - Content: View link, share link

10. **Welcome Email**
    - Trigger: First login after course purchase
    - Subject: "Welcome to [Studio Name] Pottery!"
    - Content: Getting started, book first class

---

**Member Notifications:**

1. **Piece Published**
   - Same as student version

2. **Membership Renewal Reminder**
   - Trigger: 7 days before expiry
   - Subject: "Your membership expires in 7 days"
   - Content: Renewal link, benefits reminder

3. **Piece Featured**
   - Trigger: Admin features piece
   - Subject: "Your piece was featured! 🌟"
   - Content: Public gallery link, share buttons

4. **Welcome Email**
   - Trigger: First login after membership purchase
   - Subject: "Welcome to [Studio Name]!"
   - Content: Studio hours, upload first piece

---

**Admin Notifications:**

1. **Class at Capacity**
   - Trigger: When class fills up
   - Subject: "Class full: [Class] on [Date]"
   - Content: Class details, waitlist count

2. **Waitlist Activated**
   - Trigger: First student joins waitlist
   - Subject: "Waitlist started for [Class]"
   - Content: Consider increasing capacity

3. **Student Course Expiring Soon**
   - Trigger: 7 days before student expiry (if classes unused)
   - Subject: "[Student Name]'s course expires in 7 days"
   - Content: Student has unused classes, contact suggestion

4. **Weekly Summary**
   - Trigger: Monday morning
   - Subject: "Your weekly pottery studio summary"
   - Content: Week's classes, bookings, new pieces uploaded

---

### 5.2 Email Templates

**Template: Course Expiry Warning (30 days)**

```
Subject: Your pottery course expires in 30 days

Hi [First Name],

This is a friendly reminder that your 6-class pottery course will expire on [Expiry Date].

Your Progress:
• Classes Used: [X] of 6
• Classes Remaining: [X]
• Days Until Expiry: 30

Don't let your remaining classes go to waste! 

[Book Your Next Class]

See you at the studio!
[Studio Name]

─────────────────────────
Questions? Reply to this email or call us at [Phone]
```

---

**Template: Waitlist Spot Available**

```
Subject: A spot opened in [Class Type]! 🎉

Hi [First Name],

Great news! A spot just opened up in the class you wanted:

[Class Type]
[Day], [Date] at [Time]
with [Instructor]

⏰ You have 24 hours to claim this spot!

[Claim Your Spot Now]

This link expires in: [Countdown]

If you don't claim it, we'll offer it to the next person on the waitlist.

See you soon!
[Studio Name]

─────────────────────────
Can't make it? No problem - other classes are available.
[Browse All Classes]
```

---

**Template: Class Reminder (24 hours)**

```
Subject: Reminder: Your pottery class is tomorrow!

Hi [First Name],

Just a friendly reminder about your pottery class tomorrow:

📅 [Day], [Date]
⏰ [Time]
👤 Instructor: [Instructor Name]
📍 Room: [Room]

What to Bring:
• Apron or old clothes
• Towel
• Your creativity!

Studio Location:
[Address]
[Google Maps Link]

[Add to Calendar] [Get Directions]

Can't make it? Please cancel at least 24 hours in advance so someone on the waitlist can take your spot:
[Change/Cancel Class]

See you tomorrow!
[Studio Name]

─────────────────────────
Questions? Call us at [Phone]
```

---

### 5.3 Email Delivery System

**Email Provider:**
- SendGrid or Resend
- Transactional email service
- Track opens and clicks

**Email Queue:**
- Background job processing
- Retry logic for failed sends
- Rate limiting to avoid spam flags

**Unsubscribe:**
- Required unsubscribe link in footer
- Preferences center:
  - Course reminders: Required
  - Marketing: Optional
  - Weekly summaries: Optional

**Tracking:**
- Delivery status
- Open rate
- Click rate
- Bounce handling

---

## 6. User Flows

### 6.1 Student Onboarding Flow

```
1. Purchase Course on Shopify
   ↓
2. Receive Welcome Email
   - Login credentials
   - Getting started guide
   ↓
3. First Login
   - Redirect to dashboard
   - See welcome message
   - Course details displayed
   ↓
4. Tour/Walkthrough (Optional)
   - How to book classes
   - How to upload pottery
   - How to use gallery
   ↓
5. Book First Classes
   - Browse calendar
   - Book 2-3 classes
   - Add to Google Calendar
   ↓
6. Attend First Class
   - Receive 24-hour reminder
   - Complete class
   ↓
7. Upload First Piece
   - Take photos
   - Fill in details
   - See in gallery
   ↓
8. Ongoing Usage
   - Book remaining classes
   - Upload more pieces
   - Track progress
```

---

### 6.2 Member Onboarding Flow

```
1. Purchase Membership on Shopify
   ↓
2. Receive Welcome Email
   - Login credentials
   - Studio access details
   ↓
3. First Login
   - Redirect to dashboard
   - See membership tier
   - View perks
   ↓
4. First Studio Visit
   - Create pottery
   - Take photos
   ↓
5. Upload First Piece
   - Upload photos
   - Enter details
   - See in gallery
   ↓
6. Ongoing Usage
   - Regular studio visits
   - Upload pieces
   - Browse public gallery
```

---

### 6.3 Student - Book Class Flow

```
Student Dashboard
  ↓
Click "Book a Class"
  ↓
View Available Classes Calendar
  - See all time slots
  - See vacancy counts
  - Filter by type/time
  ↓
Select Class
  - Click time slot
  ↓
Confirm Booking
  - Review class details
  - Check course progress
  - Confirm
  ↓
Booking Confirmed
  - Success message
  - Email confirmation
  - Calendar link
  ↓
Class appears in "My Classes"
```

---

### 6.4 Student - Change Class Flow

```
My Classes Page
  ↓
Click "Change Class" on booked class
  ↓
Confirmation Dialog
  "Are you sure? This will free up your spot"
  ↓
Confirm Change
  ↓
View Available Classes
  - Same calendar view
  - Excludes already booked
  ↓
Select New Class
  ↓
Confirm New Booking
  ↓
Change Complete
  - Email confirmation
  - Calendar auto-updated
  - Old class freed up
  - New class booked
```

---

### 6.5 Student - Join Waitlist Flow

```
View Class (Full)
  ↓
Click "Join Waitlist"
  ↓
Confirm Waitlist
  "You'll be notified if a spot opens"
  ↓
Waitlist Joined
  - Show position: "#3"
  - Email confirmation
  ↓
[Wait for spot to open]
  ↓
Receive Email Notification
  "Spot available! 24 hours to claim"
  ↓
Click "Claim Spot" in email
  ↓
Booking Confirmed
  - Removed from waitlist
  - Class booked
  - Calendar added
```

---

### 6.6 Student - Upload Pottery Flow

```
Gallery Page
  ↓
Click "Upload New Piece"
  ↓
Upload Photos
  - Take photo or upload
  - Add 2-5 images
  - Basic crop/rotate
  ↓
Enter Details Form
  - Title*
  - Date*
  - Clay type*
  - Glazes
  - Weights
  - Dimensions
  - Notes
  - Tags
  - Make public?
  ↓
Submit
  ↓
Instant Publish
  - Processing message
  - Success notification
  - Email confirmation
  ↓
Redirect to Piece View
  - See published piece
  - Share options
  ↓
Piece in Gallery
```

---

### 6.7 Admin - Mark Attendance Flow

```
Admin Dashboard
  ↓
Today's Classes Section
  ↓
Select Completed Class
  ↓
View Class Roster
  - List of all booked students
  ↓
Mark Attendance
  For each student:
  ☐ Present
  ☐ No-Show (with notice)
  ☐ No-Show (no notice)
  ↓
Save Attendance
  ↓
System Auto-Updates:
  - Classes_used incremented
  - Classes_forfeited (if needed)
  - Email sent to students
  ↓
Attendance Saved
  - Confirmation message
  - Updated in system
```

---

### 6.8 Admin - Feature Piece Flow

```
Admin Dashboard
  ↓
Click "Featured Work"
  ↓
View Current Featured Pieces (5)
  ↓
Click "Add Featured Piece"
  ↓
Browse All Public Pieces
  - Search/filter
  ↓
Select Piece to Feature
  ↓
Set Featured Order (1-5)
  ↓
Save
  ↓
Piece Featured
  - Shows in public gallery carousel
  - Creator notified via email
  - Badge added to piece
```

---

## 7. Phase Implementation

### Phase 1: Core Gallery + Upload (4-6 weeks)

**Week 1-2: Foundation**
- [ ] Set up project structure (React + Node.js + PostgreSQL)
- [ ] Configure development environment
- [ ] Set up database with Prisma/Drizzle
- [ ] Implement Shopify OAuth authentication
- [ ] Create JWT token system
- [ ] Build basic frontend routing
- [ ] Set up S3/Cloudinary for image storage

**Week 3-4: Gallery Features**
- [ ] Build image upload system
- [ ] Create piece details form with validation
- [ ] Implement instant publish (no review queue)
- [ ] Build gallery grid view (responsive)
- [ ] Create piece detail view
- [ ] Implement search functionality
- [ ] Add filter system (clay type, tags)
- [ ] Build edit/delete piece functionality

**Week 5-6: Polish**
- [ ] Add portfolio stats dashboard
- [ ] Implement shrinkage calculation
- [ ] Build empty states
- [ ] Add loading states
- [ ] Mobile optimization
- [ ] Basic email notifications (piece published)
- [ ] Testing and bug fixes

**Deliverables:**
- Students/members can upload pottery photos
- View personal gallery
- Search and filter pieces
- Edit/delete pieces
- See portfolio statistics

---

### Phase 2: Class Booking System (3-4 weeks)

**Week 1: Admin Class Management**
- [ ] Build admin dashboard
- [ ] Create recurring class schedule system
- [ ] Implement class template CRUD
- [ ] Generate class instances from templates
- [ ] Build class capacity management
- [ ] Create class roster view

**Week 2: Student Booking**
- [ ] Build available classes calendar view
- [ ] Implement booking system
- [ ] Add booking constraints (capacity, course limits)
- [ ] Create "My Classes" dashboard
- [ ] Build course progress tracking
- [ ] Implement 3-month expiry logic

**Week 3: Class Changes**
- [ ] Implement 24-hour change policy
- [ ] Build class change flow
- [ ] Add confirmation dialogs
- [ ] Update booking system

**Week 4: Testing & Notifications**
- [ ] Email: Booking confirmation
- [ ] Email: Class change confirmation
- [ ] Email: Course expiry warnings (30/14/7 days)
- [ ] Testing all booking scenarios
- [ ] Bug fixes

**Deliverables:**
- Admin can create class schedules
- Students can book classes
- Students can change classes (>24 hours)
- Course progress tracking works
- Email notifications sent

---

### Phase 3: Advanced Scheduling (2-3 weeks)

**Week 1: Waitlist System**
- [ ] Build waitlist join functionality
- [ ] Implement position tracking
- [ ] Create waitlist notification system
- [ ] Build 24-hour claim window
- [ ] Add waitlist expiry logic
- [ ] Admin waitlist management

**Week 2: Attendance & No-Shows**
- [ ] Build attendance marking interface
- [ ] Implement no-show policy logic
- [ ] Track advance notice cancellations
- [ ] Update classes_used and classes_forfeited
- [ ] Email notifications for no-shows
- [ ] Attendance history view

**Week 3: Google Calendar Integration**
- [ ] Implement Google Calendar API
- [ ] Generate .ics files for bookings
- [ ] Auto-update calendar on changes
- [ ] Add calendar sync for admin
- [ ] Test calendar integration
- [ ] Polish and bug fixes

**Deliverables:**
- Waitlist system functional
- Attendance tracking works
- No-show policy enforced
- Google Calendar integration complete
- All booking flows polished

---

### Phase 4: Public Gallery (2-3 weeks)

**Week 1: Public Gallery View**
- [ ] Build public gallery page (login required)
- [ ] Implement privacy opt-in controls
- [ ] Create masonry/grid layout
- [ ] Add filtering and search
- [ ] Build piece detail view (limited info)
- [ ] Implement customer-only access

**Week 2: Featured Work**
- [ ] Build featured pieces system
- [ ] Create admin feature management interface
- [ ] Build featured carousel
- [ ] Add featured badges
- [ ] Email notifications for featured pieces

**Week 3: Social & CTAs**
- [ ] Add social sharing buttons
- [ ] Implement download/print options
- [ ] Add "Book a Class" CTAs throughout
- [ ] Test sharing functionality
- [ ] SEO optimization
- [ ] Polish and testing

**Deliverables:**
- Public gallery accessible to customers
- Featured work carousel
- Social sharing works
- Privacy controls functional
- CTAs integrated

---

### Phase 5: Membership & Polish (2-3 weeks)

**Week 1: Membership Tiers**
- [ ] Implement membership tier system
- [ ] Build tier benefits display
- [ ] Add tier badges throughout app
- [ ] Implement discount calculations (firing/workshops)
- [ ] Create savings tracker
- [ ] Membership renewal reminders

**Week 2: Admin Analytics**
- [ ] Build admin analytics dashboard
- [ ] Add class utilization metrics
- [ ] Student progress analytics
- [ ] Booking analytics
- [ ] Export functionality
- [ ] Weekly summary emails

**Week 3: Final Polish**
- [ ] Mobile optimization across entire app
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] Email template polish
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Bug fixes
- [ ] Deployment preparation

**Deliverables:**
- Membership tier system complete
- Admin analytics functional
- App fully optimized
- All features tested
- Documentation complete
- Ready for production

---

**Total Timeline: 13-17 weeks (~3-4 months)**

**Critical Path:**
1. Auth + Gallery (Foundation)
2. Class Booking (Core Feature)
3. Waitlist + Attendance (Key Differentiator)
4. Public Gallery (Marketing)
5. Polish (Production Ready)

---

## 8. Success Metrics

### 8.1 Efficiency Metrics

**Student Self-Service:**
- **Target:** 95%+ of students book independently
- **Measure:** (Students who booked online / Total students) × 100
- **Impact:** Reduced admin workload

**Class Changes:**
- **Target:** 90%+ of changes done via self-service
- **Measure:** (Self-service changes / Total changes) × 100
- **Impact:** Less time answering phone calls

**Admin Time Saved:**
- **Target:** 10+ hours per week
- **Measure:** Track time spent on scheduling before/after
- **Impact:** More time for teaching and studio management

---

### 8.2 Engagement Metrics

**Gallery Usage:**
- **Target:** Average 6+ pieces per student
- **Measure:** Total pieces / Total students
- **Impact:** Students actively documenting progress

**Gallery Views:**
- **Target:** 4+ views per user per month
- **Measure:** Monthly active users viewing gallery
- **Impact:** Students engaged with their progress

**Public Gallery Opt-In:**
- **Target:** 30%+ of pieces made public
- **Measure:** (Public pieces / Total pieces) × 100
- **Impact:** Marketing content generated

---

### 8.3 Operational Metrics

**Class Utilization:**
- **Target:** 85%+ capacity utilization
- **Measure:** (Total bookings / Total capacity) × 100
- **Impact:** Optimal class sizes, revenue

**Course Completion:**
- **Target:** 90%+ students complete all 6 classes
- **Measure:** (Students who used 6/6 classes / Total students) × 100
- **Impact:** Student satisfaction, retention

**No-Show Rate:**
- **Target:** <10% no-show rate
- **Measure:** (No-shows without notice / Total bookings) × 100
- **Impact:** Minimize wasted class spots

**Waitlist Conversion:**
- **Target:** 70%+ waitlist spots claimed
- **Measure:** (Claimed spots / Offered spots) × 100
- **Impact:** Waitlist effectiveness

---

### 8.4 Business Metrics

**Course Expiry Utilization:**
- **Target:** <5% of classes expire unused
- **Measure:** (Classes forfeited or expired / Total classes allocated) × 100
- **Impact:** Revenue recognition, customer value

**Membership Renewals:**
- **Target:** Track month-over-month trend
- **Measure:** (Renewals / Expiring memberships) × 100
- **Impact:** Member retention, recurring revenue

**Photo Upload Rate:**
- **Target:** 1+ piece uploaded per class attended
- **Measure:** Total pieces / Total classes attended
- **Impact:** Student engagement, marketing content

---

### 8.5 Technical Metrics

**System Performance:**
- Page load time: <2 seconds
- API response time: <500ms
- Image upload time: <10 seconds
- Uptime: 99.9%

**Email Deliverability:**
- Delivery rate: >98%
- Open rate: >40%
- Click rate: >15%
- Bounce rate: <2%

---

### 8.6 Dashboard for Metrics

**Admin Analytics Dashboard should show:**

**This Week:**
- Classes offered: 24
- Total bookings: 156
- Capacity utilization: 87%
- Waitlist conversions: 12/15
- New pieces uploaded: 45

**This Month:**
- Active students: 78
- Active members: 32
- Course completion rate: 92%
- No-show rate: 6%
- Avg pieces per student: 7.2

**All Time:**
- Total pieces in gallery: 1,247
- Public pieces: 423 (34%)
- Featured pieces: 15
- Total classes taught: 892
- Student satisfaction: 4.8/5

---

## 9. Next Steps to Start Building

### 9.1 Pre-Development Checklist

**Technical Setup:**
- [ ] Choose hosting provider (Vercel + Railway recommended)
- [ ] Set up GitHub repository
- [ ] Create Shopify app and get API credentials
- [ ] Set up PostgreSQL database (Railway or Supabase)
- [ ] Configure S3 or Cloudinary account
- [ ] Get SendGrid/Resend API key
- [ ] Set up Google Calendar API credentials
- [ ] Create staging and production environments

**Shopify Configuration:**
- [ ] Create custom customer tags (pottery-student, pottery-member-*, etc.)
- [ ] Set up customer metafields (if needed for membership tier)
- [ ] Configure webhooks (customers/create, customers/update, orders/create)
- [ ] Test OAuth flow

**Design Assets:**
- [ ] Logo
- [ ] Color palette (earth tones)
- [ ] Typography choices
- [ ] Icon set
- [ ] Email template design
- [ ] Loading/empty state graphics

**Content:**
- [ ] Email copy for all notification types
- [ ] Welcome email content
- [ ] Studio address and contact info
- [ ] Terms of service
- [ ] Privacy policy
- [ ] FAQ content

**Test Data:**
- [ ] Create test Shopify customers (students and members)
- [ ] Prepare sample pottery images
- [ ] Create test class schedules
- [ ] Define clay types and glaze options

---

### 9.2 Development Team Roles

**If Solo (You):**
- Start with Phase 1
- Use this PRD as your guide
- Break each phase into smaller tasks
- Use Claude Code for development assistance

**If Team:**
- **Frontend Developer:** React UI, components, state management
- **Backend Developer:** API, database, Shopify integration
- **DevOps:** Hosting, deployment, monitoring
- **Designer (Optional):** UI/UX, email templates

---

### 9.3 Initial Setup Commands

```bash
# Create project structure
mkdir pottery-studio-app
cd pottery-studio-app

# Initialize frontend (React + TypeScript)
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# Install key dependencies
npm install react-router-dom @tanstack/react-query axios
npm install tailwindcss postcss autoprefixer
npm install react-hook-form zod @hookform/resolvers
npm install date-fns react-dropzone

# Initialize backend (Node.js + TypeScript)
cd ..
mkdir backend
cd backend
npm init -y
npm install express cors dotenv
npm install @shopify/shopify-api jsonwebtoken bcryptjs
npm install prisma @prisma/client
npm install multer sharp
npm install @sendgrid/mail

# Dev dependencies
npm install -D typescript @types/node @types/express
npm install -D tsx nodemon

# Initialize Prisma
npx prisma init

# Create basic structure
mkdir src
mkdir src/routes
mkdir src/controllers
mkdir src/middleware
mkdir src/services
mkdir src/utils
```

---

### 9.4 First Features to Build (Week 1)

**Day 1-2:**
- [ ] Set up basic Express server
- [ ] Configure CORS and middleware
- [ ] Set up database connection
- [ ] Create customer schema in Prisma

**Day 3-4:**
- [ ] Implement Shopify OAuth flow
- [ ] Create JWT authentication
- [ ] Build login/logout endpoints
- [ ] Test authentication flow

**Day 5-7:**
- [ ] Build basic React app structure
- [ ] Create routing (auth, dashboard, gallery)
- [ ] Implement login page
- [ ] Connect frontend to backend auth
- [ ] Test end-to-end auth flow

---

### 9.5 Resources & References

**Documentation:**
- Shopify API: https://shopify.dev/docs/api
- Prisma: https://www.prisma.io/docs
- React: https://react.dev
- Google Calendar API: https://developers.google.com/calendar
- SendGrid: https://docs.sendgrid.com

**Tools:**
- Postman (API testing): https://www.postman.com
- Figma (design): https://www.figma.com
- Linear (project management): https://linear.app

---

## 10. Appendix

### 10.1 Glossary

**Terms:**
- **Student:** Customer who purchased a 6-class pottery course
- **Member:** Customer with studio access subscription (no structured classes)
- **Class Instance:** A specific occurrence of a class (date + time)
- **Class Template:** Recurring class pattern (e.g., "Every Tuesday 10 AM")
- **Waitlist:** Queue for full classes
- **No-Show:** Student misses class without 24-hour notice
- **Forfeited Class:** Class that counts as used but wasn't attended
- **Featured Piece:** Pottery piece highlighted in public gallery
- **Public Gallery:** Customer-only gallery of opted-in pieces
- **Course Expiry:** 3-month deadline to complete all 6 classes

---

### 10.2 Sample Data Formats

**Customer Object:**
```json
{
  "id": 123,
  "shopify_customer_id": "gid://shopify/Customer/456",
  "email": "student@example.com",
  "first_name": "Sarah",
  "last_name": "Johnson",
  "customer_type": "student",
  "course_purchase_date": "2024-10-01T00:00:00Z",
  "course_expiry_date": "2024-12-31T23:59:59Z",
  "classes_allocated": 6,
  "classes_used": 2,
  "classes_forfeited": 1,
  "membership_tier": null,
  "created_at": "2024-10-01T10:30:00Z"
}
```

**Pottery Piece Object:**
```json
{
  "id": 789,
  "customer_id": 123,
  "title": "Celadon Vase",
  "date_completed": "2024-10-15",
  "clay_type": "Stoneware",
  "glazes": ["Celadon Green", "Clear Gloss"],
  "original_weight": 2.5,
  "final_weight": 2.1,
  "shrinkage_percent": 16.0,
  "height": 25.0,
  "length": 15.0,
  "width": 15.0,
  "notes": "First attempt at celadon glazing",
  "images": [
    "https://cdn.example.com/pieces/789-1.jpg",
    "https://cdn.example.com/pieces/789-2.jpg"
  ],
  "tags": ["vase", "celadon", "wheel-thrown"],
  "is_public": true,
  "featured": false,
  "created_at": "2024-10-15T14:30:00Z"
}
```

**Class Instance Object:**
```json
{
  "id": 456,
  "template_id": 12,
  "class_date": "2024-10-20",
  "start_time": "10:00:00",
  "end_time": "12:00:00",
  "class_type": "Wheel Throwing",
  "instructor": "Sarah Chen",
  "room": "Main Studio",
  "max_capacity": 8,
  "current_enrollment": 7,
  "status": "active",
  "created_at": "2024-09-01T00:00:00Z"
}
```

**Booking Object:**
```json
{
  "id": 321,
  "student_id": 123,
  "class_instance_id": 456,
  "booking_date": "2024-10-10T09:15:00Z",
  "status": "booked",
  "advance_notice_given": false,
  "attended": null,
  "created_at": "2024-10-10T09:15:00Z"
}
```

---

### 10.3 Future Enhancements (Post-MVP)

**Phase 6+ Ideas:**

**Student Features:**
- Progress photos (before/after)
- Compare pieces over time
- Skills tracking (techniques mastered)
- Certificates of completion
- Referral program

**Member Features:**
- Studio usage tracking (hours)
- Equipment booking system
- Member-only events
- Community forum/chat

**Gallery Enhancements:**
- Like/favorite pieces
- Comments on public pieces
- Collections/albums
- Instagram integration
- Print-on-demand merch

**Class Features:**
- Recurring bookings (every Tuesday for 6 weeks)
- Group bookings (book with a friend)
- Private lessons
- Video tutorials library
- Skill assessments

**Admin Tools:**
- Automated reports
- Revenue analytics
- Inventory management (clay, glazes)
- Firing schedule management
- Student feedback system

**Marketing:**
- Public website integration
- Blog/content management
- Newsletter management
- Social media auto-posting
- Gift certificates

---

### 10.4 Contact & Support

**For Development Questions:**
- Technical support: [Your Email]
- PRD clarifications: [Your Email]
- Feature requests: [Your Email]

**Project Owner:**
- Justin Long
- Pottery Studio Owner
- Email: justin@higher.com

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Oct 13, 2024 | Justin Long | Initial PRD created |

---

**END OF PRD**

This Product Requirements Document is a living document and will be updated as the project evolves. All stakeholders should refer to the latest version for accurate requirements.
