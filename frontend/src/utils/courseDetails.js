/**
 * Course detail content for student dashboard — matches email templates
 */

const STUDIO_ADDRESS = '75 Jalan Kelabu Asap, Chip Bee Gardens 278268';
const STUDIO_MAP_URL = 'https://maps.app.goo.gl/g84xejcaZbAsD2ze7';

const COMMON_ITEMS = [
  'Pottery Tool Set — $18',
  'Ves Apron — $45',
  'Ves Tote bag — $12 not required',
  'Advanced trimming tool — $12 (Intermediate)',
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
      'The foundation of pottery wheelthrowing will be taught during this 6 week ceramics course (2.5hr/class/week). Students will be taught how to throw a cylinder form, after which they will work on forms such as bowls and cups, then trimming and glazing using in-studio Ves glazes. After 6 weeks, students will have their own glazed vessels fired. This course is ideal for beginners with little or no experience at all or for the skilled seeking to challenge themselves.',
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
    title: '3-Course Wheelthrowing Package (3 x 6-Week)',
    description: [
      'This 3 Course Package (3 x 6-week Wheelthrowing) is exclusively for returning students. This package includes:',
      { heading: 'Package Benefits', items: [
        'FREE 3 studio access passes worth ~$50 each (Save $150!)',
        'Option to swop classes 1 for 1 (e.g., swopping a glazing class for a handbuilding or wheelthrowing class)',
        'Your preferred wheel RESERVED every class you attend',
      ]},
      'All other details follow our Wheelthrowing Beginner/Ext 6 Weeks course:',
      'The foundation of pottery wheelthrowing will be taught during this 6 week ceramics course (one 2.5 hour/class/week). Students will be taught how to throw a cylinder form, after which they will work on forms such as bowls and cups, trimming and glazing using in-studio Ves glazes. After 6 weeks, students will have their own glazed vessels fired and may be collected 1 month after. This course is ideal for beginners with little or no experience at all and for the skilled intermediate seeking to challenge themselves.',
      { heading: 'Weeks 1–5', text: 'Cylinder forms—the core fundamental before any other forms in wheel-throwing. Afterwhich, students progress to U-form and V-form bowls, S-form-pitchers, then joining handles. Instructors will guide students according to their different abilities and speed of progression from beginners to intermediate.' },
      { heading: 'Week 6', text: 'Explore the fundamentals of glazing, learning how to prepare and apply made-in-studio glazes through dipping and pouring. Each student will get to glaze their own bisque-fired pieces for the final kiln firing.' },
    ],
    fees: 'Unlimited usage of clay, up to 7 finished pieces per course (21 total), use of wheel and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: 'To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.',
    makeup: 'While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–5, and ONE for week 6 (glazing) of each course cycle, subject to our schedule and availability.',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'wt-7week-inter': {
    title: '7-Week Intermediate Wheelthrowing',
    description: [
      { heading: 'Pre-requisite', text: 'Complete the 6-week Beginner/Extension Course with the ability to throw 700g S-forms comfortably.' },
      'This course is for those who have done at least 3 Beginner/Extension classes. In this 7 week course, students will be introduced to heavier clay weights to improve on throwing bigger cylinders and bowls. In the subsequent weeks, they will also be introduced to making pieces in sets, bottle forms, vases and how to trim narrow-neck bottles. In the final week, students will learn how to glaze and decorate their pieces.',
      { heading: 'Weeks 1–6', text: 'Focus on mastering 800g clay to create larger and more refined forms — wide bowls, narrow-neck vessels, and plates in three variations. Students will also craft a cohesive sake set, honing precision and consistency. Each project builds on control, proportion, and finishing techniques.' },
      { heading: 'Week 7', text: 'Explore the fundamentals of glazing, learning how to prepare, wax, and apply made-in-studio glazes through dipping and pouring. Each student will get to glaze their own bisque-fired pieces for the final kiln firing.' },
    ],
    fees: 'Unlimited usage of clay, up to 8 finished pieces, use of wheel and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: 'To ensure individualised attention, class size is limited to 8, with 2 additional wheels for make-up classes only. Classes are non-refundable. If you are unable to attend the entire course, you may transfer your enrolment before course commencement.',
    makeup: 'While we cannot guarantee make-up classes, each student may arrange ONE make-up class within weeks 1–6, and ONE for week 7 (glazing), subject to our schedule and availability.',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'hb-4credit': {
    title: 'Handbuilding 4-Week Course',
    description: [
      'This 4-week handbuilding course introduces the fundamentals of working with clay by hand. Each class runs for 2.5 hours with instructor guidance throughout.',
      { heading: 'Week 1 — Foundations of Pinching', items: [
        'Explore the fundamentals of pinching techniques',
        'Craft your first cups through the art of pinching',
      ]},
      { heading: 'Week 2 — Learning Coiling', items: [
        'Progress to creating larger pieces using coiling',
        'Learn the skill of connecting separate clay bodies',
      ]},
      { heading: 'Week 3 — Intro to Slab-Making', items: [
        'Learn how to make flatware by making slabs',
        'Experiment with decorating techniques like carving, drawing, and adding attachments',
      ]},
      { heading: 'Week 4 — Intro to Glazing', items: [
        'Gain insights into the theory of glazing',
        'Experience different glazing applications as a finishing touch',
      ]},
    ],
    fees: 'Unlimited usage of clay, up to 5 finished pieces of 600g each or 3000g combined, use of tools and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: null,
    makeup: null,
    items: [
      'Ves Apron — $45, not required',
      'Ves Tote bag — $12 not required',
    ],
    rules: COMMON_RULES,
  },
  'hb-8credit': {
    title: 'Handbuilding 8-Week Course',
    description: [
      'This 8-week handbuilding course builds on the foundations of the 4-week programme, introducing sculpting, detailing, and advanced techniques. Each class runs for 2.5 hours with instructor guidance throughout.',
      { heading: 'Weeks 1–3 — Foundations', items: [
        'Week 1 — Foundations of Pinching',
        'Week 2 — Learning Coiling',
        'Week 3 — Intro to Slab-making',
      ]},
      { heading: 'Weeks 4/5 — Intro to Sculpting', items: [
        'Understand the foundation of sculpture',
        'Explore techniques for building form and structure',
      ]},
      { heading: 'Weeks 6/7 — Learn Detailing', items: [
        'Learn how to shape facial forms',
        'Experiment with how to bring personality and expression',
      ]},
      { heading: 'Week 8 — Intro to Glazing', items: [
        'Gain insights into the theory of glazing',
        'Experience different glazing applications as a finishing touch',
      ]},
    ],
    fees: 'Unlimited usage of clay, up to 9 finished pieces of 600g each or 4500g combined, use of tools and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: null,
    makeup: null,
    items: [
      'Ves Apron — $45, not required',
      'Ves Tote bag — $12 not required',
    ],
    rules: COMMON_RULES,
  },
  'kids-clay': {
    title: 'Kids Let\'s Play with Clay',
    description: [
      'Our kid\'s workshop is specially designed with our experienced early learning teacher, for kids ages 6 and up. In these workshops, they\'ll learn fundamental techniques to make functional pieces such as mugs, bowls and trays, and they can decorate their pieces with designs like animal faces, or engrave their names on them.',
      'Every class will be catered to learning something new and every kid will be able to make a piece and have it fired after class. Parents are welcome to sign up and participate with their kids. This course will take in a maximum of 8 students to provide maximum guidance.',
      '* Additional ticket (on top of purchased ticket for participating child) is required for any Parent/Guardian accompanying their child for the class.',
    ],
    fees: null,
    classSize: null,
    makeup: null,
    items: [
      'Comfortable clothes that can get dirty',
      'Closed-toe shoes',
      'An apron (or purchase one at $45)',
    ],
    rules: COMMON_RULES,
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
