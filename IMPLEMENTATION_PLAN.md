# Student Class History & Gallery Integration - Implementation Plan

## Overview
This plan implements a comprehensive student class history and gallery management system that allows students to:
- View their class history (past and current courses)
- Link gallery pieces to specific courses they attended
- Add multiple images (up to 10) per gallery piece with dates and descriptions
- View their gallery work organized by course

## Phase 1: Database Schema Changes

### Step 1.1: Add course_enrollment_id to pottery_pieces
Run this SQL in Supabase SQL Editor:

```sql
-- Add course_enrollment_id to pottery_pieces
ALTER TABLE "pottery_pieces"
ADD COLUMN IF NOT EXISTS "course_enrollment_id" INTEGER
REFERENCES "course_enrollments"("id") ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS "idx_pottery_pieces_course_enrollment_id"
  ON "pottery_pieces"("course_enrollment_id");
```

### Step 1.2: Update images structure
The `images` JSONB field will support this structure:
```json
[
  {
    "url": "https://...",
    "description": "First firing",
    "date_added": "2025-01-15",
    "order": 1
  },
  {
    "url": "https://...",
    "description": "After glazing",
    "date_added": "2025-01-20",
    "order": 2
  }
]
```
Max 10 images per piece.

## Phase 2: Backend API Endpoints

### Endpoints to Add/Update:

#### 1. GET /api/classes/my-history
✅ **COMPLETED** - Returns student's class history grouped by course enrollments

Response:
```json
{
  "history": [
    {
      "id": 123,
      "type": "course",
      "courseTitle": "Wheelthrowing Beginner",
      "numberOfWeeks": 6,
      "startDate": "2025-01-15",
      "endDate": "2025-02-26",
      "instructor": "John Doe",
      "status": "current" | "completed",
      "classes": [
        {
          "id": 1,
          "date": "2025-01-15T19:00:00",
          "startTime": "7:00 PM",
          "endTime": "9:30 PM",
          "classType": "WT Beginner Week 1/6",
          "attended": true,
          "status": "booked"
        }
      ]
    }
  ],
  "totalClasses": 10,
  "attendedClasses": 8
}
```

#### 2. GET /api/pottery/pieces/by-course/:courseEnrollmentId
Get all gallery pieces created during a specific course

#### 3. PUT /api/pottery/pieces/:id
Update to support:
- `course_enrollment_id` field
- New `images` array format with multiple images

#### 4. POST /api/pottery/pieces/:id/images
Add a new image to an existing piece (max 10)

#### 5. DELETE /api/pottery/pieces/:id/images/:imageIndex
Remove an image from a piece

## Phase 3: Frontend Pages & Components

### 3.1: Student Class History Page (`/my-classes`)
**File:** `frontend/src/pages/StudentClassHistory.jsx`

Features:
- List all courses (current and past)
- Show course details (dates, instructor, number of classes)
- Display attendance record
- Link to gallery pieces created in each course
- Timeline view of class progression

Layout:
```
┌─────────────────────────────────────────┐
│ My Class History                        │
├─────────────────────────────────────────┤
│                                          │
│ Current Courses (1)                      │
│ ┌──────────────────────────────────────┐│
│ │ Wheelthrowing Beginner - 6 Weeks     ││
│ │ Jan 15 - Feb 26, 2025                ││
│ │ Instructor: John Doe                 ││
│ │ Classes: 4/6 attended                ││
│ │ [View Gallery Pieces (2)]            ││
│ └──────────────────────────────────────┘│
│                                          │
│ Past Courses (2)                         │
│ ┌──────────────────────────────────────┐│
│ │ Handbuilding - 4 Weeks               ││
│ │ Nov 1 - Nov 29, 2024                 ││
│ │ Instructor: Jane Smith               ││
│ │ Classes: 4/4 attended ✓              ││
│ │ [View Gallery Pieces (5)]            ││
│ └──────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### 3.2: Enhanced Gallery Form
**Files:**
- `frontend/src/pages/GalleryNew.jsx` (update)
- `frontend/src/components/GalleryForm.jsx` (new component)

Features:
- Dropdown to select course (from class history)
- Multiple image upload (up to 10)
- Each image has:
  - Upload/URL input
  - Description field
  - Date added (auto or manual)
  - Drag-and-drop reordering
- Preview all images with delete option

### 3.3: Image Management Component
**File:** `frontend/src/components/ImageManager.jsx`

Features:
- Grid view of all images
- Add new image button (disabled if 10 images)
- Each image card shows:
  - Thumbnail preview
  - Description input
  - Date added
  - Delete button
  - Drag handle for reordering

Layout:
```
┌────────────────────────────────────────┐
│ Images (3/10)        [+ Add Image]     │
├────────────────────────────────────────┤
│ ┌─────┐  ┌─────┐  ┌─────┐             │
│ │ 🖼️  │  │ 🖼️  │  │ 🖼️  │             │
│ │Image│  │Image│  │Image│             │
│ │  1  │  │  2  │  │  3  │             │
│ ├─────┤  ├─────┤  ├─────┤             │
│ │Desc │  │Desc │  │Desc │             │
│ │[___]│  │[___]│  │[___]│             │
│ │Date │  │Date │  │Date │             │
│ │ ❌  │  │ ❌  │  │ ❌  │             │
│ └─────┘  └─────┘  └─────┘             │
└────────────────────────────────────────┘
```

### 3.4: Course Gallery View
**File:** `frontend/src/pages/CourseGallery.jsx`

Shows all gallery pieces created during a specific course enrollment:
- Course info header
- Grid of all pieces from that course
- Click piece to view details

## Phase 4: Implementation Steps

1. ✅ Run database migration (add_gallery_course_link.sql)
2. ✅ Add `/api/classes/my-history` endpoint
3. ⏳ Add pottery piece endpoints for course linking
4. ⏳ Create StudentClassHistory page
5. ⏳ Create ImageManager component
6. ⏳ Update GalleryForm to support courses and multiple images
7. ⏳ Add navigation link to "My Classes" in Navigation component
8. ⏳ Test end-to-end flow
9. ⏳ Deploy to production

## Files Created/Modified

### Backend (server/)
- ✅ `add_gallery_course_link.sql` - Database migration
- ✅ `index.js` - Added my-history endpoint

### Frontend (frontend/src/)
- ⏳ `pages/StudentClassHistory.jsx` - NEW
- ⏳ `pages/CourseGallery.jsx` - NEW
- ⏳ `components/ImageManager.jsx` - NEW
- ⏳ `components/GalleryForm.jsx` - NEW or update existing
- ⏳ `components/Navigation.jsx` - Add "My Classes" link

## Next Steps

To continue implementation:
1. First, manually run the SQL migration in Supabase dashboard
2. Complete backend API endpoints for pottery pieces
3. Build frontend components starting with Student Class History page
4. Test with real data
5. Deploy

## Questions to Resolve

1. Should students be able to add pieces to courses retroactively?
2. What happens to gallery pieces if a course enrollment is deleted?
3. Should there be a separate page for "Add Gallery Piece" vs viewing existing ones?
4. File upload: Use Supabase storage or external service (Cloudinary, etc.)?
