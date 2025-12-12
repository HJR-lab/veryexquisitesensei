/**
 * Course Scheduler Utilities
 * Handles parsing of Shopify course variant titles and generation of class instance dates
 */

/**
 * Parse course information from Shopify product title and variant
 * @param {string} title - Product title (e.g., "Wheelthrowing Beginner Course")
 * @param {string} variantTitle - Variant title (e.g., "6 weeks TUESDAYS | 20 Oct - 24 Nov")
 * @returns {Object} Parsed course information
 */
function parseCourseInfo(title, variantTitle) {
  const result = {
    courseTitle: title,
    variantTitle: variantTitle,
    courseType: null,
    schedulePattern: null, // Day of week (e.g., "TUESDAY", "WEDNESDAY")
    numberOfWeeks: null,
    startDate: null,
    endDate: null,
    classTime: null,
    instructor: null,
    room: null
  };

  // Extract course type from title
  const titleLower = title.toLowerCase();
  if (titleLower.includes('wheelthrowing') || titleLower.includes('wheel throwing')) {
    if (titleLower.includes('beginner')) {
      result.courseType = 'Wheelthrowing Beginner';
    } else if (titleLower.includes('intermediate')) {
      result.courseType = 'Wheelthrowing Intermediate';
    } else if (titleLower.includes('advanced')) {
      result.courseType = 'Wheelthrowing Advanced';
    } else {
      result.courseType = 'Wheelthrowing';
    }
  } else if (titleLower.includes('handbuilding') || titleLower.includes('hand building')) {
    if (titleLower.includes('beginner')) {
      result.courseType = 'Handbuilding Beginner';
    } else if (titleLower.includes('intermediate')) {
      result.courseType = 'Handbuilding Intermediate';
    } else {
      result.courseType = 'Handbuilding';
    }
  } else if (titleLower.includes('glazing')) {
    result.courseType = 'Glazing';
  }

  // Parse number of weeks from title first (e.g., "6-week Beginner")
  const titleWeeksMatch = title.match(/(\d+)[-\s]*weeks?/i);
  if (titleWeeksMatch) {
    result.numberOfWeeks = parseInt(titleWeeksMatch[1]);
  }

  if (!variantTitle) {
    return result;
  }

  // Parse number of weeks from variant (e.g., "6 weeks", "6-week", "4 week")
  // This overrides the title if present
  const weeksMatch = variantTitle.match(/(\d+)[-\s]*weeks?/i);
  if (weeksMatch) {
    result.numberOfWeeks = parseInt(weeksMatch[1]);
  }

  // Parse day of week (e.g., "TUESDAYS", "WEDNESDAYS")
  const dayMatch = variantTitle.match(/(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)S?/i);
  if (dayMatch) {
    result.schedulePattern = dayMatch[1].toUpperCase();
  }

  // Parse date range (e.g., "20 Oct - 24 Nov", "15 October - 19 November")
  const monthMap = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'sept': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };

  const dateRangeMatch = variantTitle.match(/(\d{1,2})\s+(\w+)\s*[-–]\s*(\d{1,2})\s+(\w+)/i);
  if (dateRangeMatch) {
    const startDay = parseInt(dateRangeMatch[1]);
    const startMonthStr = dateRangeMatch[2].toLowerCase();
    const endDay = parseInt(dateRangeMatch[3]);
    const endMonthStr = dateRangeMatch[4].toLowerCase();

    const startMonth = monthMap[startMonthStr];
    const endMonth = monthMap[endMonthStr];

    if (startMonth !== undefined && endMonth !== undefined) {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();

      // Determine year for start date
      // RULE: All classes are in the current year (2025)
      // Orders are placed in Jan 2025 for classes happening later in 2025
      let startYear = currentYear;

      // Create date in GMT+8 (Singapore timezone)
      // Use UTC date to avoid timezone conversion issues
      const dateStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      result.startDate = new Date(dateStr + 'T00:00:00+08:00');

      // Determine year for end date
      let endYear = startYear;
      if (endMonth < startMonth) {
        endYear = startYear + 1;
      }

      // Create end date in GMT+8 (Singapore timezone)
      const endDateStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      result.endDate = new Date(endDateStr + 'T00:00:00+08:00');
    }
  }

  // Parse time if present (e.g., "7:00 PM - 9:30 PM")
  const timeMatch = variantTitle.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  if (timeMatch) {
    result.classTime = `${timeMatch[1]} - ${timeMatch[2]}`;
  }

  return result;
}

/**
 * Get the day of week number (0 = Sunday, 1 = Monday, etc.)
 * @param {string} dayName - Day name (e.g., "MONDAY", "TUESDAY")
 * @returns {number} Day of week number
 */
function getDayOfWeekNumber(dayName) {
  const days = {
    'SUNDAY': 0,
    'MONDAY': 1,
    'TUESDAY': 2,
    'WEDNESDAY': 3,
    'THURSDAY': 4,
    'FRIDAY': 5,
    'SATURDAY': 6
  };
  return days[dayName.toUpperCase()];
}

/**
 * Generate individual class dates based on course schedule
 * @param {Object} courseInfo - Parsed course info from parseCourseInfo
 * @returns {Array<Date>} Array of class dates
 */
function generateClassDates(courseInfo) {
  const { startDate, endDate, schedulePattern, numberOfWeeks } = courseInfo;

  if (!startDate || !schedulePattern) {
    return [];
  }

  const dates = [];
  const targetDayOfWeek = getDayOfWeekNumber(schedulePattern);

  // IMPORTANT: Work with UTC dates to avoid timezone issues
  // startDate is already in GMT+8, so we need to extract the SGT date components
  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();
  const startDay = startDate.getUTCDate();

  // Create a new date in local time using the UTC components
  // This ensures we're working with the intended Singapore date
  let currentDate = new Date(startYear, startMonth, startDay);
  const startDayOfWeek = currentDate.getDay();

  // Adjust to the first occurrence of the target day
  let daysToAdd = (targetDayOfWeek - startDayOfWeek + 7) % 7;
  if (daysToAdd === 0 && currentDate.getDay() !== targetDayOfWeek) {
    daysToAdd = 7;
  }

  currentDate.setDate(currentDate.getDate() + daysToAdd);

  // Generate dates for the specified number of weeks or until end date
  const maxWeeks = numberOfWeeks || 52; // Default to max 52 weeks if not specified

  // Extract end date components if provided
  let maxEndYear, maxEndMonth, maxEndDay;
  if (endDate) {
    maxEndYear = endDate.getUTCFullYear();
    maxEndMonth = endDate.getUTCMonth();
    maxEndDay = endDate.getUTCDate();
    // IMPORTANT: Add 1 day because endDate is stored as midnight SGT which is the
    // previous day in UTC. For example, "25 Oct" becomes Oct 24 16:00 UTC.
    maxEndDay += 1;
  } else {
    maxEndYear = startYear + 1;
    maxEndMonth = startMonth;
    maxEndDay = startDay;
  }

  for (let week = 0; week < maxWeeks; week++) {
    // Check if current date is after the end date (compare date components)
    const curYear = currentDate.getFullYear();
    const curMonth = currentDate.getMonth();
    const curDay = currentDate.getDate();

    if (curYear > maxEndYear ||
        (curYear === maxEndYear && curMonth > maxEndMonth) ||
        (curYear === maxEndYear && curMonth === maxEndMonth && curDay > maxEndDay)) {
      break;
    }

    dates.push(new Date(currentDate));

    // Move to next week
    currentDate.setDate(currentDate.getDate() + 7);
  }

  return dates;
}

/**
 * Generate a cohort identifier for grouping students in the same course
 * @param {Object} courseInfo - Parsed course info
 * @returns {string} Cohort identifier (e.g., "wheelthrowing_beginner_2025_10_15_tuesday")
 */
function generateCohortId(courseInfo) {
  const { courseType, startDate, schedulePattern } = courseInfo;

  if (!courseType || !startDate) {
    return null;
  }

  const typeSlug = courseType.toLowerCase().replace(/\s+/g, '_');
  const year = startDate.getFullYear();
  const month = String(startDate.getMonth() + 1).padStart(2, '0');
  const day = String(startDate.getDate()).padStart(2, '0');
  const daySlug = schedulePattern ? schedulePattern.toLowerCase() : 'tbd';

  return `${typeSlug}_${year}_${month}_${day}_${daySlug}`;
}

/**
 * Generate VES course identifier
 * Format: WT1210AM_DL6.4
 * - WT = Wheelthrowing, HB = Handbuilding
 * - 1210 = Date (12th Oct)
 * - AM/PM/NT = Time slot (AM=9:30-12pm, PM=1-3:30pm, NT=7-9:30pm)
 * - DL/JL/LT = Instructor initials
 * - 6.4 = 6 week course, week 4
 * @param {Object} courseInfo - Parsed course info
 * @param {Date} actualClassDate - The actual first class date (not courseInfo.startDate which may be different)
 * @param {string} instructorCode - Instructor code (DL, JL, LT)
 * @param {number} weekNumber - Current week number (1-based)
 * @returns {string} Course identifier
 */
function generateCourseIdentifier(courseInfo, actualClassDate, instructorCode, weekNumber) {
  const { courseType, classTime, numberOfWeeks } = courseInfo;

  if (!courseType || !actualClassDate) {
    return null;
  }

  // Course type code
  let typeCode = 'WT'; // Default to Wheelthrowing
  if (courseType.toLowerCase().includes('handbuilding')) {
    typeCode = 'HB';
  }

  // Date code (DDMM format per CLASS_SCHEDULE_RULES.md)
  // Use the actual class date, not courseInfo.startDate which may be timezone-shifted
  // IMPORTANT: Use local date methods to avoid timezone conversion
  // The dates are JavaScript Date objects created with GMT+8 offset
  // Using getDate() and getMonth() will give us the correct SGT values
  const day = String(actualClassDate.getDate()).padStart(2, '0');
  const month = String(actualClassDate.getMonth() + 1).padStart(2, '0');
  const dateCode = day + month; // DDMM format

  // Time slot code
  let timeCode = 'NT'; // Default to Night
  if (classTime) {
    const timeLower = classTime.toLowerCase();
    // Check for AM slot (9:30 AM start)
    if ((timeLower.includes('9:30') || timeLower.includes('930')) && timeLower.includes('am')) {
      timeCode = 'AM';
    }
    // Check for PM slot (1:00 PM start)
    else if ((timeLower.includes('1:00') || timeLower.includes('100') || timeLower.includes('1 ')) && timeLower.includes('pm')) {
      timeCode = 'PM';
    }
    // Check for NT slot (7:00 PM start)
    else if ((timeLower.includes('7:00') || timeLower.includes('700')) && timeLower.includes('pm')) {
      timeCode = 'NT';
    }
  }

  // Week indicator
  const weekIndicator = `${numberOfWeeks || 6}.${weekNumber || 1}`;

  return `${typeCode}${dateCode}${timeCode}_${instructorCode}${weekIndicator}`;
}

/**
 * Create class instance objects ready for database insertion
 * @param {Object} courseInfo - Parsed course info
 * @param {Object} options - Additional options
 * @param {string} options.instructorName - Instructor name (e.g., "Joyce Lim")
 * @param {string} options.instructorCode - Instructor code (e.g., "JL")
 * @param {string} options.room - Room name (default: "Studio A")
 * @param {number} options.maxCapacity - Max capacity (default: 10)
 * @param {string} options.startTime - Start time (default: "7:00 PM")
 * @param {string} options.endTime - End time (default: "9:30 PM")
 * @returns {Array<Object>} Array of class instance objects
 */
function createClassInstances(courseInfo, options = {}) {
  const {
    instructorName = 'Joyce Lim',
    instructorCode = 'JL',
    room = 'Studio A',
    maxCapacity = 10,
    startTime = '7:00 PM',
    endTime = '9:30 PM'
  } = options;

  const classDates = generateClassDates(courseInfo);

  if (classDates.length === 0) {
    return [];
  }

  // Use the FIRST actual class date for the course identifier (not courseInfo.startDate)
  const firstClassDate = classDates[0];

  return classDates.map((date, index) => {
    const weekNumber = index + 1;
    // Pass the first class date to generate the base identifier
    const courseIdentifier = generateCourseIdentifier(courseInfo, firstClassDate, instructorCode, weekNumber);

    // Format date as YYYY-MM-DD without timezone conversion
    // Use local date methods to get the date in SGT (GMT+8)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const classDateStr = `${year}-${month}-${day}`;

    return {
      class_date: classDateStr, // Store as YYYY-MM-DD in Singapore timezone
      start_time: courseInfo.classTime ? courseInfo.classTime.split(' - ')[0] : startTime,
      end_time: courseInfo.classTime ? courseInfo.classTime.split(' - ')[1] : endTime,
      class_type: courseIdentifier || `${courseInfo.courseType} (Week ${weekNumber}/${classDates.length})`,
      instructor: courseInfo.instructor || instructorName,
      room: courseInfo.room || room,
      max_capacity: maxCapacity,
      current_enrollment: 0,
      status: 'active',
      updated_at: new Date().toISOString()
    };
  });
}

module.exports = {
  parseCourseInfo,
  generateClassDates,
  generateCohortId,
  generateCourseIdentifier,
  createClassInstances,
  getDayOfWeekNumber
};
