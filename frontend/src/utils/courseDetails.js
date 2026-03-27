/**
 * Course detail content for student dashboard — matches email templates
 */

const STUDIO_ADDRESS = '75 Jalan Kelabu Asap, Chip Bee Gardens 278268';
const STUDIO_MAP_URL = 'https://maps.app.goo.gl/g84xejcaZbAsD2ze7';

const COMMON_ITEMS = [
  'Tool Set — available at $18 ($12 for advanced trimming tool)',
  'Ves Apron — required, not provided (available at $45)',
  'Ves Tote bag — not provided (available at $12)',
];

const COMMON_RULES = [
  'To enter, press the doorbell and someone will to attend to you',
  'Initial your work clearly in 3 text/numbers to avoid mix-ups',
  'Wipe your seat and wheels clean after use for the next user',
  'If you are unwell, please wear a mask',
  'Wear comfortable clothes and closed-toe shoes',
  'Cut your nails appropriately',
  'Eating is not allowed in the studio',
  'If you are under 16, please notify us in advance',
  'If you would like to make more than the allowed number of pieces, each additional piece is $20',
  'If you would like more wheelthrowing practice time, we offer unguided studio access for current students at $20/hr min 2hrs, full hours only',
  'NEW VES IS 10 2026: all RETURNING students will receive $20 in credits for each wheelthrowing course taken. Returning students have the option to use their credits to throw more pieces, book studio access, or receive a discount of their credit amount for their next course'
];

const COURSE_DETAILS = {
  'wt-6week': {
    title: '6-Week Beginner/Extension Wheelthrowing',
    description: [
      'The foundation of pottery wheelthrowing will be taught during this 6 week ceramics course (2.5hr/class/week). Students will be taught how to throw a cylinder, after which they will work on forms such as bowls and cups, then trimming and glazing using in-studio Ves glazes. After 6 weeks, students will have their own glazed vessels fired. This course is ideal for beginners with little or no experience at all or for the skilled seeking to challenge themselves.',
      { heading: 'Weeks 1–5', text: 'We begin with cylinder forms—the core fundamental before any other forms in wheelthrowing. Afterwhich, students progress to U-form and V-form bowls, S-form-pitchers, then joining handles. Instructors will guide students according to their different abilities and speed of progression from beginners to intermediate.' },
      { heading: 'Week 6', text: 'Explore the fundamentals of glazing, learning how to prepare and apply made-in-studio glazes through dipping and pouring. Each student will get to glaze their own bisque-fired pieces for the final kiln firing.' },
    ],
    fees: 'Unlimited usage of clay, up to 7 finished pieces, use of wheel and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: 'To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you can ONLY transfer your enrolment before course commencement.',
    makeup: 'While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for week 6 (glazing), subject to schedule and availability.',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'wt-10class': {
    title: '10-Class Wheelthrowing',
    description: [
      'For students who want more time on the wheel or experience handbuilding with our instructors, this extended 10-class course builds on our standard 6-week programme, offering 4 additional instructor-led classes before final glazing.',
      { heading: 'Classes 1–5', text: 'Students begin with cylinder forms—the fundamental foundation of wheelthrowing—before progressing to U-form and V-form bowls, S-form pitchers, and handle joining. Instructors will guide each student according to individual ability and pace, from beginner to intermediate levels.' },
      { heading: 'Classes 6–9 (New)', text: 'For your 4 additional classes, choose from either wheelthrowing or handbuilding to further deepen your practice, focusing on refining form, control, and technique. Students will explore a range of handbuilding methods including pinching, coiling, and slab-making, while continuing to build their understanding of clay, with guidance tailored to individual progress and interests.' },
      { heading: 'Class 10', text: 'Students will be introduced to the fundamentals of glazing, learning how to prepare and apply made-in-studio glazes through dipping and pouring. Each student will glaze their own bisque-fired pieces, which will then undergo final kiln firing.' },
    ],
    fees: 'Unlimited use of clay, up to 11 finished pieces, access to wheels, equipment, glazing, decorating materials and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: 'To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.',
    makeup: 'While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for week 6 (glazing), subject to schedule and availability.',
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
  'hb-4credit': {
    title: 'Handbuilding 4-Credit Package',
    description: 'Your 4 credits can be used to book individual handbuilding sessions. Browse available classes and book at your convenience through the Ves Clay Club portal.',
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
 * Studio policies — single source of truth
 * Used by: PolicyPopup, Policies page, course detail cards
 * Edit here to update everywhere.
 */
export const STUDIO_POLICIES = {
  classSizeAndPolicies: {
    title: 'Class Size and Policies',
    content: 'To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.',
  },
  makeupClasses: {
    title: 'Make-Up Classes',
    content: 'While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for the final week (glazing), subject to our schedule and availability. Please inform us in advance if you need to schedule a make-up class.',
  },
  punctuality: {
    title: 'Punctuality',
    content: 'As this is a structured course, please be punctual. The studio opens for entry 10 minutes before class begins. Class will begin and end on time.',
  },
  itemsRequired: {
    title: 'Items Required',
    items: COMMON_ITEMS,
  },
  studioRules: {
    title: 'Studio Rules',
    items: COMMON_RULES,
  },
  collectionAndDisposal: {
    title: 'Collection & Disposal',
    content: 'Collection of finished pieces is by appointment only, within 1 month after your final class. We reserve the right to dispose of uncollected pieces after 3 months. Please contact us to arrange collection.',
  },
  general: {
    title: 'General',
    content: 'We reserve the right to blacklist and ban students that do not comply with the rules or conduct any illegal or inappropriate activity in our premises.',
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
  if (courseType.includes('handbuilding')) {
    return weeks <= 4 ? COURSE_DETAILS['hb-4credit'] : COURSE_DETAILS['hb-8credit'];
  }
  if (weeks === 10) return COURSE_DETAILS['wt-10class'];
  if (weeks >= 18 || title.includes('3 course')) return COURSE_DETAILS['wt-3x6week'];
  if (weeks === 7 || courseType.includes('intermediate')) return COURSE_DETAILS['wt-7week-inter'];
  return COURSE_DETAILS['wt-6week'];
}

export { STUDIO_ADDRESS, STUDIO_MAP_URL };
