/**
 * Course Type Detection and Configuration
 *
 * Identifies the 4 different wheelthrowing course types and their specific attributes
 */

export const COURSE_TYPES = {
  STANDARD_6_WEEK: 'standard_6_week',
  TEN_CLASS_PACKAGE: 'ten_class_package',
  THREE_COURSE_PACKAGE: 'three_course_package',
  INTERMEDIATE_7_WEEK: 'intermediate_7_week',
  HANDBUILDING_4_WEEK: 'handbuilding_4_week',
  HANDBUILDING_8_WEEK: 'handbuilding_8_week'
};

export const COURSE_TYPE_CONFIG = {
  [COURSE_TYPES.STANDARD_6_WEEK]: {
    name: '6-Week Course',
    shortName: '6-Week WT',
    color: 'blue',
    structure: '6 classes over 6 weeks',
    perks: [
      'Up to 7 finished pieces',
      '1 makeup session allowed',
      'Small class size (max 8)',
      'Unlimited clay'
    ],
    badge: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      label: '6-Week'
    }
  },
  [COURSE_TYPES.TEN_CLASS_PACKAGE]: {
    name: '10-Class Package',
    shortName: '10-Class',
    color: 'purple',
    structure: '6 core WT + 4 flexible (WT/HB)',
    perks: [
      'NO EXPIRY on classes',
      'Up to 10 finished pieces',
      'Flexible 4 additional classes',
      'Mix wheelthrowing & handbuilding',
      '1 makeup session allowed'
    ],
    badge: {
      bg: 'bg-purple-100',
      text: 'text-purple-800',
      label: '10-Class • No Expiry'
    },
    hasFlexibleCredits: true,
    coreClasses: 6,
    flexibleClasses: 4
  },
  [COURSE_TYPES.THREE_COURSE_PACKAGE]: {
    name: '3-Course Package',
    shortName: '3-Course',
    color: 'green',
    structure: '3 x 6-week courses (18 weeks total)',
    perks: [
      'FREE 3 studio access passes',
      '1-for-1 class swap option',
      'Reserved wheel guarantee',
      'Up to 7 pieces per course',
      'Premium pottery experience'
    ],
    badge: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: '3-Course Package'
    },
    isMultiCourse: true,
    totalCourses: 3
  },
  [COURSE_TYPES.INTERMEDIATE_7_WEEK]: {
    name: 'Intermediate 7-Week',
    shortName: 'Intermediate',
    color: 'orange',
    structure: '7 weeks of advanced techniques',
    perks: [
      'Advanced wheelthrowing skills',
      'Heavier clay weights',
      'Larger forms and bottles',
      'Glazing techniques'
    ],
    badge: {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      label: 'Intermediate'
    },
    requiresPrerequisite: true
  },
  [COURSE_TYPES.HANDBUILDING_4_WEEK]: {
    name: '4-Week Handbuilding',
    shortName: '4-Week HB',
    color: 'amber',
    structure: '4 classes over 4 weeks',
    perks: [
      'Pinching, coiling, slab-building',
      'Glazing techniques',
      'Unlimited clay'
    ],
    badge: {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      label: '4-Week HB'
    }
  },
  [COURSE_TYPES.HANDBUILDING_8_WEEK]: {
    name: '8-Week Handbuilding',
    shortName: '8-Week HB',
    color: 'amber',
    structure: '8 classes over 8 weeks',
    perks: [
      'Sculptural work & expressive forms',
      'Faces, figures, abstract designs',
      'Unlimited clay'
    ],
    badge: {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      label: '8-Week HB'
    }
  }
};

/**
 * Detect course type from enrollment data
 * @param {Object} enrollment - Course enrollment object
 * @returns {string} - Course type constant
 */
export function detectCourseType(enrollment) {
  if (!enrollment) return COURSE_TYPES.STANDARD_6_WEEK;

  const title = enrollment.course_title || enrollment.courseTitle || '';
  const weeks = enrollment.number_of_weeks || enrollment.numberOfWeeks;
  const packageCourses = enrollment.package_total_courses || enrollment.packageTotalCourses;

  // Check for 3-Course Package (has package_total_courses = 3)
  if (packageCourses === 3 || title.includes('3 Course Package') || title.includes('3-Course Package')) {
    return COURSE_TYPES.THREE_COURSE_PACKAGE;
  }

  // Check for 10-Class Package (10 weeks OR title contains "10 Classes" or "+ 4 Flexible")
  if (weeks === 10 || title.includes('10 Classes') || title.includes('+ 4 Flexible')) {
    return COURSE_TYPES.TEN_CLASS_PACKAGE;
  }

  // Check for Intermediate 7-Week
  if (weeks === 7 || title.toLowerCase().includes('intermediate')) {
    return COURSE_TYPES.INTERMEDIATE_7_WEEK;
  }

  // Check for Handbuilding courses
  if (title.toLowerCase().includes('handbuilding')) {
    if (weeks === 8 || title.includes('8-week') || title.includes('8 week')) {
      return COURSE_TYPES.HANDBUILDING_8_WEEK;
    }
    return COURSE_TYPES.HANDBUILDING_4_WEEK;
  }

  // Default to standard 6-week
  return COURSE_TYPES.STANDARD_6_WEEK;
}

/**
 * Get course type configuration
 * @param {string} courseType - Course type constant
 * @returns {Object} - Course configuration object
 */
export function getCourseConfig(courseType) {
  return COURSE_TYPE_CONFIG[courseType] || COURSE_TYPE_CONFIG[COURSE_TYPES.STANDARD_6_WEEK];
}

/**
 * Get course type from enrollment object
 * @param {Object} enrollment - Enrollment object
 * @returns {Object} - { type, config } object
 */
export function getCourseTypeInfo(enrollment) {
  const type = detectCourseType(enrollment);
  const config = getCourseConfig(type);
  return { type, config };
}
