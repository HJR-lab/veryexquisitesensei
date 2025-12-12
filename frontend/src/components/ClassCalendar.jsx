import { useState } from 'react';

export default function ClassCalendar({
  currentMonth,
  onMonthChange,
  onDateSelect,
  selectedDate,
  getClassesForDate,
  highlightedDates = [],
  classTypeConfig = {},
  getClassCategory = () => 'other',
  classTypeFilter = 'all',
  isAdminView = false,
  isEnrolled = () => false
}) {
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Convert Sunday (0) to 6, Monday (1) to 0, etc. for Monday-first week
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7;

    return { daysInMonth, startingDayOfWeek };
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const renderCalendarMonth = (monthDate, isFirstMonth) => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(monthDate);

    return (
      <div className="bg-background-alt border border-border p-4">
        <div className="flex items-center justify-between">
          {isFirstMonth ? (
            <button
              className="p-2 hover:bg-background"
              onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            >
              <span className="material-symbols-outlined text-text-muted">chevron_left</span>
            </button>
          ) : (
            <div className="w-10" />
          )}
          <p className="text-lg font-bold uppercase">{monthNames[monthDate.getMonth()]} {monthDate.getFullYear()}</p>
          {!isFirstMonth ? (
            <button
              className="p-2 hover:bg-background"
              onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            >
              <span className="material-symbols-outlined text-text-muted">chevron_right</span>
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        <div className="grid grid-cols-7 gap-1 mt-4">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
            <p key={i} className="text-center text-xs font-bold text-text-muted py-2">{day}</p>
          ))}

          {Array.from({ length: startingDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
            const isSelected = date.toDateString() === selectedDate.toDateString();

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const dayStr = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${dayStr}`;

            const dayClasses = getClassesForDate(date);
            const hasClasses = dayClasses.length > 0;
            const isPartOfHighlightedCourse = highlightedDates.includes(dateStr);

            // Check if this date has glazing classes (Week 6)
            const hasGlazingClass = dayClasses.some(c => {
              if (isAdminView) {
                // In admin view, check the fullCourseIdentifier for ".6" (week 6)
                return c.fullCourseIdentifier?.endsWith('.6') || c.courseIdentifier?.endsWith('.6');
              } else {
                // In student view, check fullCourseIdentifier or courseIdentifier for ".6"
                return c.fullCourseIdentifier?.endsWith('.6') || c.courseIdentifier?.endsWith('.6');
              }
            });

            let bgColorClass = '';
            let isEnrolledDay = false;

            if (hasClasses) {
              // Check if student is enrolled in any class on this day (student view only)
              if (!isAdminView) {
                isEnrolledDay = dayClasses.some(c => isEnrolled(c.id));
              }

              // Show light orange for all wheelthrowing classes EXCEPT glazing week (.6)
              // If this day has glazing classes, skip the orange background
              if (!hasGlazingClass) {
                if (classTypeFilter === 'all' && dayClasses.length > 0) {
                  const classCategories = [...new Set(dayClasses.map(c => getClassCategory(c.class_type)))];
                  const config = classTypeConfig[classCategories[0]];
                  if (config) {
                    bgColorClass = config.bgLight;
                  }
                } else if (classTypeFilter !== 'all') {
                  const config = classTypeConfig[classTypeFilter];
                  if (config) {
                    bgColorClass = config.bgLight;
                  }
                }
              }

              // Special background for glazing classes (brown for week 6)
              if (hasGlazingClass && !isEnrolledDay) {
                bgColorClass = 'bg-amber-800/30';
              }

              // Override with blue background for enrolled days (student view only)
              if (isEnrolledDay) {
                bgColorClass = isSelected ? 'bg-blue-700 text-white' : 'bg-blue-700/20';
              }
            }

            return (
              <button
                key={day}
                onClick={(e) => onDateSelect(date, dayClasses, e)}
                className={`h-10 w-full text-sm font-medium ${
                  isEnrolledDay ? bgColorClass : (isSelected || isPartOfHighlightedCourse ? 'bg-accent text-white' : bgColorClass)
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      {renderCalendarMonth(currentMonth, true)}
      <div className="mt-4">
        {renderCalendarMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1), false)}
      </div>
    </div>
  );
}
