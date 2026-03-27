/**
 * Course detail content for student dashboard — matches email templates
 */

const STUDIO_ADDRESS = '75 Jalan Kelabu Asap, Chip Bee Gardens 278268';
const STUDIO_MAP_URL = 'https://maps.app.goo.gl/g84xejcaZbAsD2ze7';

const COMMON_ITEMS = [
  'Tools — available for purchase ($15, $12 for advanced trimming tool) or bring your own',
  'Apron — required, not provided (available for $18)',
  'Carry bag — not provided (tote bags available for $12)',
];

const COMMON_RULES = [
  'Press the doorbell on the wall to enter',
  'Initial your work clearly in 3 text/numbers to avoid mix-ups',
  'Clean up after yourself and wipe your seat and wheels',
  'Wear a mask if you are unwell',
  'Wear comfortable clothes and closed-toe shoes',
  'Cut your nails appropriately',
  'Eating is not allowed in the studio',
  'If you are under 16, please notify us in advance',
];

const COURSE_DETAILS = {
  'wt-6week': {
    title: '6-Week Beginner/Extension Wheelthrowing',
    description: 'This 6-week course will teach you the fundamentals of wheel-throwing. You will learn how to throw cylinder and bowl forms, turn/trim bases, and apply glazing techniques using special VES glazes. By the end of the course, you will have your own set of glazed pots and bowls, which can be collected within one month after the final class.',
    fees: 'Clay, bisque firing (up to 7 pieces), advanced tools and equipment use, decorating and glazing materials, and glaze firing. Additional tools and pieces will incur extra charges.',
    classSize: 'To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.',
    makeup: 'While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for week 6 (glazing), subject to our schedule and availability.',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'wt-10class': {
    title: '10-Class Wheelthrowing',
    description: 'This package includes a 6-week structured wheelthrowing course plus 4 flexible classes that can be used for additional wheelthrowing or handbuilding sessions. The structured course teaches the fundamentals of wheel-throwing including cylinder and bowl forms, turning/trimming, and glazing with special VES glazes.',
    fees: 'Clay, bisque firing (up to 10 pieces), advanced tools and equipment use, decorating and glazing materials, and glaze firing. Additional tools and pieces will incur extra charges.',
    classSize: 'To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.',
    makeup: 'While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for week 6 (glazing), subject to our schedule and availability.',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'wt-3x6week': {
    title: '3-Course Wheelthrowing Package',
    description: 'This package includes three consecutive 6-week wheelthrowing courses (18 weeks total). You will progressively build your skills from fundamentals through advanced techniques, including cylinder and bowl forms, turning/trimming, and glazing with special VES glazes.',
    fees: 'Clay, bisque firing (up to 21 pieces — 7 per course), advanced tools and equipment use, decorating and glazing materials, and glaze firing. Additional tools and pieces will incur extra charges.',
    classSize: 'To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.',
    makeup: 'While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for week 6 (glazing) of each course cycle, subject to our schedule and availability.',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'wt-7week-inter': {
    title: '7-Week Intermediate Wheelthrowing',
    description: 'This 7-week intermediate course is designed for students who have completed the beginner course. You will advance your wheel-throwing skills with more complex forms, refined trimming techniques, and expanded glazing methods using special VES glazes.',
    fees: 'Clay, bisque firing (up to 8 pieces), advanced tools and equipment use, decorating and glazing materials, and glaze firing. Additional tools and pieces will incur extra charges.',
    classSize: 'To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.',
    makeup: 'While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–6, and ONE for week 7 (glazing), subject to our schedule and availability.',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'hb-8credit': {
    title: 'Handbuilding 8-Credit Package',
    description: 'Your 8 credits can be used to book individual handbuilding sessions. Browse available classes and book at your convenience through the Ves Clay Club portal.',
    fees: 'Clay, bisque firing, tools and equipment use, decorating and glazing materials, and glaze firing. Additional pieces will incur extra charges.',
    classSize: null,
    makeup: null,
    items: [
      'Apron — required, not provided (available for $18)',
      'Carry bag — not provided (tote bags available for $12)',
    ],
    rules: [
      'Press the doorbell on the wall to enter',
      'Initial your work clearly in 3 text/numbers to avoid mix-ups',
      'Clean up after yourself and wipe your work area',
      'Wear a mask if you are unwell',
      'Wear comfortable clothes and closed-toe shoes',
      'Eating is not allowed in the studio',
      'If you are under 16, please notify us in advance',
    ],
  },
  'kids-clay': {
    title: 'Kids Let\'s Play with Clay',
    description: 'A fun hands-on clay session for kids! Your child will explore clay through handbuilding techniques in our studio.',
    fees: null,
    classSize: null,
    makeup: null,
    items: [
      'Comfortable clothes that can get dirty',
      'Closed-toe shoes',
      'An apron (or purchase one for $18)',
    ],
    rules: [
      'Press the doorbell on the wall to enter',
      'A parent or guardian must accompany children under 12',
      'Eating is not allowed in the studio',
    ],
  },
};

/**
 * Detect which course details to show based on enrollment data
 */
export function getCourseDetails(enrollment) {
  const title = (enrollment.course_title || '').toLowerCase();
  const courseType = (enrollment.course_type || '').toLowerCase();
  const weeks = enrollment.number_of_weeks;

  if (title.includes('kids') || title.includes('play with clay')) return COURSE_DETAILS['kids-clay'];
  if (courseType.includes('handbuilding')) return COURSE_DETAILS['hb-8credit'];
  if (weeks === 10) return COURSE_DETAILS['wt-10class'];
  if (weeks >= 18 || title.includes('3 course')) return COURSE_DETAILS['wt-3x6week'];
  if (weeks === 7 || courseType.includes('intermediate')) return COURSE_DETAILS['wt-7week-inter'];
  return COURSE_DETAILS['wt-6week'];
}

export { STUDIO_ADDRESS, STUDIO_MAP_URL };
