# 3x6wk WT Course Progression

## Problem

Students who purchase a 3x6 week wheelthrowing package only get their first 6-week course auto-created. There's no mechanism to advance them to courses 2 and 3. Admin must manually add students to classes individually.

## Design

### Trigger Conditions

The "Continue to Next Course" button appears on the admin student detail page when ALL of:
- Student has `package_total_courses = 3`
- `package_courses_remaining > 0` (has unused courses in their package)
- A launched course exists matching the same day + time pattern (doesn't need 4-pax threshold yet)

### User Flow

1. Admin opens student detail for a 3x6wk student
2. Near the package progress bar, a button shows: **"Enroll in Next Course"** with the target course info (e.g., "WT Sat PM Apr 11 - Dillon Lin")
3. Admin clicks → new enrollment created for that course
4. Student counts toward 4-pax threshold like any other enrollment
5. Once threshold is met, bookings auto-created for all 6 weeks (existing cohort auto-processor handles this)
6. If no matching launched course exists, button is hidden

### Backend

**New endpoint:** `POST /api/admin/students/:studentId/continue-package`

Request body:
```json
{
  "currentEnrollmentId": 5104,
  "targetCourseIdentifier": "WT1104PM_DL6"
}
```

Logic:
1. Validate student has a 3x6wk package with remaining courses
2. Validate target course exists and matches day/time pattern
3. Create new `course_enrollment` record:
   - Copy `course_type`, `schedule_pattern`, `class_time`, `instructor` from target course
   - Set `package_total_courses = 3`
   - Set `package_courses_remaining` = current remaining - 1
   - Set `shopify_order_id` from original enrollment (links to same purchase)
   - Set `status = 'active'` (enrolled, waiting for threshold)
   - Set `course_identifier` from target course
4. Return the new enrollment

**Finding the next course:** Query `class_instances` for future courses matching:
- Same `schedule_pattern` (day of week)
- Same `start_time`
- Start date after current course end date
- Take the earliest match

### Frontend (AdminStudentDetail.jsx)

In the package progress section, add:
- When `package_courses_remaining > 0` and a next course is found:
  - Show button: "Enroll in Next Course"
  - Below button: target course details (identifier, dates, instructor)
- When no matching course exists: show muted text "No matching upcoming course launched yet"
- After clicking: success message, refresh enrollment data

### Data Model

No schema changes needed. The new enrollment uses existing fields:
- `package_total_courses` — carried forward (3)
- `package_courses_remaining` — decremented
- `shopify_order_id` — same as original (links package enrollments together)
- All other fields populated from the target course

### Edge Cases

- **Student already enrolled in next course:** Check for duplicate before creating. Disable button if already enrolled.
- **Course identifier changes:** Match by day/time pattern, not exact identifier string.
- **Admin wants different timeslot:** Not in scope. Admin can use existing manual enrollment for exceptions.
- **Last course in package:** Button hidden when `package_courses_remaining = 0`.
