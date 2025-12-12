# Class Schedule Rules & Configuration

## Instructors & Schedule

### Dillon Lin - Weekends Only
- **Days**: Saturday, Sunday
- **Class Type**: Wheelthrowing (Beginner & Intermediate)
- **Typical Times**:
  - 9:30 AM - 12:00 PM
  - 1:00 PM - 3:30 PM (Saturdays)

### Joyce Lim - Weekdays Only
- **Days**: Tuesday, Thursday, Friday
- **Class Type**: Wheelthrowing (Beginner & Intermediate)
- **Typical Times**:
  - 9:30 AM - 12:00 PM
  - 7:00 PM - 9:30 PM

### Lynette Ting - Handbuilding Wednesdays
- **Days**: Wednesday only
- **Class Type**: Handbuilding
- **Time**: 7:00 PM - 9:30 PM
- **Format**: Ongoing weekly classes (NOT course-based)
- **Flexibility**: Students can start and end according to their purchased duration (4-8 weeks)

## Time Zone

**All class times are in GMT+8 (Singapore Time)**

## Class Capacity

### Wheelthrowing Classes
- **Maximum Capacity**: 8 wheels per class (+2 wheels for reschedule makeup)
- **Applies to**: All wheelthrowing classes (both Beginner and Intermediate)

### Handbuilding Classes
- **Maximum Capacity**: 10 students per class

## Course Structure

### Wheelthrowing Beginner
- **Duration**: 6 weeks
- **Format**: Fixed 6-week courses with specific start dates
- **Students must**: Complete all 6 consecutive weeks

### Wheelthrowing Intermediate
- **Duration**: 7 weeks
- **Format**: Fixed 7-week courses with specific start dates
- **Students must**: Complete all 7 consecutive weeks

### Handbuilding
- **Duration**: Flexible (4 or 8 weeks depending on purchase)
- **Format**: Ongoing weekly classes every Wednesday
- **Students can**:
  - Start any Wednesday
  - Attend 4 or 8 weeks based on their package purchase
  - Book their Wednesday class to start their 4or 8 week course

## Course Identifier Format

### Wheelthrowing Format: `[TYPE][DDMM][TIME]_[INSTRUCTOR][WEEKS].[WEEK#]`

**Examples:**
- `WT1010AM_JL6.1` = Wheelthrowing, Oct 10 start, AM (9:30am), Joyce Lim, 6-week course, Week 1
- `WT2110NT_JL6.3` = Wheelthrowing, Oct 21 start, Night (7pm), Joyce Lim, 6-week course, Week 3
- `WT0410AM_DL6.1` = Wheelthrowing, Oct 4 start, AM (9:30am), Dillon Lin, 6-week course, Week 1
- `WT0410PM_DL7.5` = Wheelthrowing, Oct 4 start, PM (1pm), Dillon Lin, 7-week intermediate, Week 5

### Handbuilding Format

**Class Identifier:** `[TYPE][DAY][TIME]_[INSTRUCTOR]`
- `HBWEDNT_LT` = Handbuilding, Wednesday, Night (7pm), Lynette Ting

**Student Enrollment Format:** `[First3Letters].[LastInitial]_[DDMM]_[WEEKS].[WEEK#]`

Where `[DDMM]` is the start class date of the students course.

**Examples:**
- Student: Hyojin Sul, starts Nov 5, 4-week course
  - Week 1 (Nov 5): `Hyo.S_0511_4.1`
  - Week 2 (Nov 12): `Hyo.S_0511_4.2`
  - Week 3 (Nov 19): `Hyo.S_0511_4.3`
  - Week 4 (Nov 26): `Hyo.S_0511_4.4`
- Student: Sheela P, starts Nov 5, 4-week course (skips Nov 12)
  - Week 1 (Nov 5): `She.S_0511_4.1`
  - Week 2 (Nov 19): `She.S_0511_4.2` *skipped Nov 12*
  - Week 3 (Nov 26): `She.S_0511_4.3`
  - Week 4 (Dec 3): `She.S_0511_4.4`
- Student: John Doe, starts Oct 8, 8-week course
  - Week 5 (Nov 5): `Joh.D_0511_8.5`

### Component Breakdown:

**Type Codes:**
- `WT` = Wheelthrowing
- `HB` = Handbuilding

**Date Code (DDMM):**
- `1010` = October 10 (day 10, month 10)
- `2110` = October 21 (day 21, month 10)
- Format: Day (2 digits) + Month (2 digits)

**Time Codes:**
- `AM` = 9:30 AM class
- `PM` = 1:00 PM class
- `NT` = 7:00 PM class (Night Time)

**Instructor Codes:**
- `JL` = Joyce Lim
- `DL` = Dillon Lin
- `LT` = Lynette Ting

**Course Length:**
- `6` = 6-week beginner course
- `7` = 7-week intermediate course
- `4` = 4-week handbuilding course
- `8` = 8-week handbuilding course

**Week Number:**
- `.1` through `.6` for 6-week courses
- `.1` through `.7` for 7-week intermediate courses
- `.1` through `.4` for 4-week handbuilding courses
- `.1` through `.8` for 8-week handbuilding courses

## Course Grouping Logic

### Wheelthrowing (6-week & 7-week)
1. Group classes by: `class_type + start_time + instructor + day_of_week`
2. Sort chronologically
3. Group into consecutive courses:
   - 6 weeks for beginner courses
   - 7 weeks for intermediate courses
   - Classes must be within 14 days of each other to be part of same course
   - If gap > 14 days, start a new course

### Handbuilding (Student-Based Tracking)
- Handbuilding uses a single class identifier: `HBWEDNT_LT` (all Wednesday 7PM classes)
- Each student has their own enrollment tracking within this class
- Students book 4 or 8 weeks based on their package purchase
- Student progress is tracked individually: `[Name]_[StartDate]_[TotalWeeks].[CurrentWeek]`
- Students can attend non-consecutive weeks (flexible schedule)
- No fixed course grouping - each student's course is independent

## Database Schema Notes

### class_instances table
- `class_date`: YYYY-MM-DD format (date only, no time component)
- `start_time`: "9:30 AM", "1:00 PM", "7:00 PM" format
- `end_time`: "12:00 PM", "3:30 PM", "9:30 PM" format
- `max_capacity`: 8 for wheelthrowing, 10 for handbuilding
- `current_enrollment`: Tracked automatically via bookings
- `instructor`: Full name ("Joyce Lim", "Dillon Lin", "Lynette Ting")
- `class_type`: "Wheelthrowing Beginner", "Wheelthrowing Intermediate", "Handbuilding"

### bookings table (for handbuilding student tracking)
For handbuilding students, each booking should track:
- `student_id`: Link to customer
- `class_instance_id`: Link to specific Wednesday class
- `handbuilding_start_date`: When student started their 4 or 8-week course (YYYY-MM-DD)
- `handbuilding_total_weeks`: 4 or 8
- `handbuilding_current_week`: Which week of their course (1-4 or 1-8)
- `course_identifier`: Generated as `[First3].[LastInit]_[DDMM]_[Weeks].[Week#]`

**Example booking records for Hyojin Sul's 4-week course starting Nov 5:**
- Nov 5: `Hyo.S_0511_4.1` (start_date: 2025-11-05, total_weeks: 4, current_week: 1)
- Nov 12: `Hyo.S_0511_4.2` (start_date: 2025-11-05, total_weeks: 4, current_week: 2)
- Nov 19: `Hyo.S_0511_4.3` (start_date: 2025-11-05, total_weeks: 4, current_week: 3)
- Nov 26: `Hyo.S_0511_4.4` (start_date: 2025-11-05, total_weeks: 4, current_week: 4)

**Example with skipped week (Sheela P's 4-week course starting Nov 5, skips Nov 12):**
- Nov 5: `She.S_0511_4.1` (start_date: 2025-11-05, total_weeks: 4, current_week: 1)
- Nov 19: `She.S_0511_4.2` (start_date: 2025-11-05, total_weeks: 4, current_week: 2) *skipped Nov 12*
- Nov 26: `She.S_0511_4.3` (start_date: 2025-11-05, total_weeks: 4, current_week: 3)
- Dec 3: `She.S_0511_4.4` (start_date: 2025-11-05, total_weeks: 4, current_week: 4)

## Pause & Reschedule System

### Within Current Course (No Fee)
- Students can reschedule to a different time slot on the same day/week within their current 6-week course
- Example: Tuesday 7pm student can reschedule to Thursday 7pm for the same week

### Glazing Class (Week 6.6) - Special Rule
- **No fee required**: Students can book their glazing class (week 6.6) up to **2 courses ahead**
- Example: Student in Oct course (weeks 1-5) can attend glazing in Dec course
- Reason: Glazing is flexible timing and doesn't need to be immediate after week 5

### Next Course Makeup (with Fee)
- **$40 per class fee**: Students who miss classes and want to make them up in the next course
- Fee applies to all classes except glazing (6.6)
- Example: Missed week 3 in Oct course → Can make up week 3 in Nov course for $40

### Pause System
- Students can pause their course mid-way (e.g., completed weeks 1-3, pause at week 4)
- They resume in a future course from where they left off (weeks 4, 5, 6)
- **Pause fee**: $40 per makeup class in the next course
- Paused students are tracked with:
  - Which week they paused at
  - Which course they'll resume in
  - Total fees owed for makeup classes

## Important Notes

1. **Day of Week Separation**: Tuesday and Thursday classes taught by Joyce Lim are separate courses even though both are at 7:00 PM. They are grouped by day of week.

2. **Time Slot Uniqueness**: Each instructor has specific time slots to avoid conflicts:
   - Joyce Lim: Friday mornings (9:30 AM) and Tuesday and Thursday evenings (7:00 PM)
   - Dillon Lin: Saturday and Sunday mornings (9:30 AM) and Saturday afternoons (1:00 PM)
   - Lynette Ting: Wednesday evenings (7:00 PM) only

3. **Handbuilding Flexibility**: Unlike wheelthrowing, handbuilding students don't need to complete a fixed consecutive week course. It is flexible to skip Wednesdays but they do need attend based on purchased weeks (4 or 8).

4. **Shopify Integration**: Course identifiers should match between Shopify product variants and the internal system for proper tracking.

## Questions to Clarify

1. Should intermediate 7-week courses follow the same naming convention with "7" instead of "6"?
yes
2. Are there any holiday breaks or scheduled class cancellations to account for?
yes currently dillon will be on holiday from 17 nov 2025 to 14 jan 2026. joyce will be away from 26 nov 2025 to 14 jan 2026.
3. Should handbuilding students be able to attend non-consecutive weeks, or must they attend consecutive Wednesdays?
non consecutive to complete their 4 or 8 weeks course
4. What happens if a wheelthrowing student misses a week - can they make it up in another course?
yes if they miss a class, they can reschedule. that is why we are building a reschedule for makeup system next
students can reschedule with other 6 week handbuilding classes held on other days within their 6 weeks course. students can book their glazing 6.6 class up to 2 courses ahead without any fee. students who miss classes and want to reschedule for the next course for makeup have to incur a $40/class fee for makeup in the next course outside of their current course. 
5. Is there a maximum number of courses a student can be enrolled in simultaneously?
no
