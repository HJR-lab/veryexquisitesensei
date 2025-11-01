# Reschedule Calendar Update Instructions

Due to file size constraints, here's what needs to be updated in ClassScheduleNew.jsx:

## Changes Made:
1. ✅ Added state variables for reschedule calendar (lines 24-25)
2. ✅ Added 30-minute buffer to `getAvailableMakeupClasses()` function
3. ✅ Added `getRescheduleClassesForDate()` helper function

## Still TODO:
Replace the Reschedule Modal (lines 868-937) with a calendar-based UI similar to the main booking calendar.

The reschedule modal should:
- Show a calendar with dates that have available makeup classes highlighted
- Allow clicking dates to see available classes for that day
- Filter out classes starting in < 30 minutes (already done in `getAvailableMakeupClasses()`)
- Use `rescheduleSelectedDate` and `rescheduleCurrentMonth` state
- Display classes for selected date in a list below the calendar

The modal should be wider (max-w-5xl instead of max-w-2xl) to accommodate the calendar + class list layout.
