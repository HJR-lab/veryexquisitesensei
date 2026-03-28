/**
 * Course detail content for student dashboard — matches email templates
 */

const STUDIO_ADDRESS = '75 Jalan Kelabu Asap, Chip Bee Gardens 278268';
const STUDIO_MAP_URL = 'https://maps.app.goo.gl/g84xejcaZbAsD2ze7';

const COMMON_ITEMS = [
  'Pottery Tool Set — required; bring your own or purchase from Ves ($18)',
  'Apron — required; not provided by the studio. Ves branded aprons available ($45)',
  'Tote Bag — recommended for transporting finished work. Ves totes available ($12)',
  'Advanced Trimming Tool — optional add-on for intermediate students ($12)',
];

const COMMON_RULES = [
  'Upon arrival, please press the doorbell. A staff member will attend to you.',
  'All work must be clearly initialled using three (3) characters to prevent mix-ups.',
  'Please clean your workspace after each session, including wiping down your seat and wheel.',
  'Students who are unwell are asked to wear a mask while in the studio.',
  'Comfortable clothing and closed-toe shoes are required.',
  'Please ensure fingernails are trimmed appropriately for working with clay.',
  'Food and beverages (other than water) are not permitted in the studio.',
  'Students under the age of 16 must notify the studio in advance of enrolment.',
  'Additional pieces beyond your allowance may be fired at $20 per piece.',
  'Unguided studio access is available to current students at $20/hr, minimum two (2) hours, full-hour increments only.',
  'NEW FOR 2026 — All returning students will receive $20 in studio credits for each wheelthrowing course completed. Credits may be applied towards additional pieces, studio access, or a discount on your next course.',
];

const COURSE_DETAILS = {
  'wt-6week': {
    title: '6-Week Beginner/Extension Wheelthrowing',
    description: [
      'A structured six-week ceramics course (2.5 hours per class per week) covering the fundamentals of wheelthrowing. Students progress from centering and pulling clay into cylinder forms through to bowls, cups, trimming, and glazing using in-studio Ves glazes. By the end of the course, each student will have their own set of glazed vessels fired and ready for collection. Suitable for complete beginners and returning students looking to refine their skills.',
      { heading: 'Weeks 1–4 — Centering & Pulling', items: [
        'Beginners learn to centre clay and pull cylinder forms — the core foundation of all wheelthrowing.',
        'Returning students refine their technique, progressing to larger bowls, pitchers, and vases.',
        'Instructors guide each student according to their ability and pace.',
      ]},
      { heading: 'Week 5 — Trimming & Finishing', items: [
        'Students learn to turn and trim the bases of their pieces for a clean, professional finish.',
        'Techniques for foot rings, surface refinement, and preparing work for bisque firing.',
      ]},
      { heading: 'Week 6 — Glazing', items: [
        'Introduction to the fundamentals of glazing — preparing, dipping, and pouring in-studio Ves glazes.',
        'Each student glazes their own bisque-fired pieces for the final kiln firing.',
      ]},
    ],
    fees: 'Unlimited usage of clay, up to 7 finished pieces, use of wheel and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: 'To ensure individualised attention, class size is limited to eight (8) students, with two (2) additional wheels reserved for make-up classes only. All course fees are strictly non-refundable. Students may transfer their entire course enrolment to another individual before course commencement. Partial transfers are not permitted.',
    makeup: 'You are allowed to reschedule up to three (3) make-up classes, subject to cohort schedule and availability. You must reschedule more than twenty-four (24) hours before class starts. Missed classes are forfeited. A $20 no-show fee applies for missed make-up classes. A $40 fee applies per make-up class outside your cohort schedule (glazing excluded).',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'wt-10class': {
    title: '10-Class Wheelthrowing',
    description: [
      'An extended ten-class course (2.5 hours per class) that builds on the standard six-week programme with four additional instructor-led classes. Students gain extra time on the wheel or explore handbuilding before final glazing.',
      { heading: 'Classes 1–4 — Centering & Pulling', items: [
        'Beginners learn to centre clay and pull cylinder forms — the core foundation of all wheelthrowing.',
        'Returning students refine their technique, progressing to larger bowls, pitchers, and vases.',
        'Instructors guide each student according to their ability and pace.',
      ]},
      { heading: 'Class 5 — Trimming & Finishing', items: [
        'Students learn to turn and trim the bases of their pieces for a clean, professional finish.',
        'Techniques for foot rings, surface refinement, and preparing work for bisque firing.',
      ]},
      { heading: 'Classes 6–9 — Extended Practice', items: [
        'Four additional classes to deepen your practice in wheelthrowing or handbuilding.',
        'Handbuilding options include pinching, coiling, and slab-making techniques.',
        'Guidance tailored to individual progress and interests.',
      ]},
      { heading: 'Class 10 — Glazing', items: [
        'Introduction to the fundamentals of glazing — preparing, dipping, and pouring in-studio Ves glazes.',
        'Each student glazes their own bisque-fired pieces for the final kiln firing.',
      ]},
    ],
    fees: 'Unlimited use of clay, up to 11 finished pieces, access to wheels, equipment, glazing, decorating materials and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: 'To ensure individualised attention, class size is limited to eight (8) students, with two (2) additional wheels reserved for make-up classes only. All course fees are strictly non-refundable. Students may transfer their entire course enrolment to another individual before course commencement. Partial transfers are not permitted.',
    makeup: 'You are allowed to reschedule up to three (3) make-up classes, subject to cohort schedule and availability. You must reschedule more than twenty-four (24) hours before class starts. Missed classes are forfeited. A $20 no-show fee applies for missed make-up classes. A $40 fee applies per make-up class outside your cohort schedule (glazing excluded).',
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
      'Each six-week cycle follows the same course structure:',
      { heading: 'Weeks 1–4 — Centering & Pulling', items: [
        'Beginners learn to centre clay and pull cylinder forms — the core foundation of all wheelthrowing.',
        'Returning students refine their technique, progressing to larger bowls, pitchers, and vases.',
        'Instructors guide each student according to their ability and pace.',
      ]},
      { heading: 'Week 5 — Trimming & Finishing', items: [
        'Students learn to turn and trim the bases of their pieces for a clean, professional finish.',
        'Techniques for foot rings, surface refinement, and preparing work for bisque firing.',
      ]},
      { heading: 'Week 6 — Glazing', items: [
        'Introduction to the fundamentals of glazing — preparing, dipping, and pouring in-studio Ves glazes.',
        'Each student glazes their own bisque-fired pieces for the final kiln firing.',
      ]},
    ],
    fees: 'Unlimited usage of clay, up to 7 finished pieces per course (21 total), use of wheel and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: 'To ensure individualised attention, class size is limited to eight (8) students, with two (2) additional wheels reserved for make-up classes only. All course fees are strictly non-refundable. Students may transfer their entire course enrolment to another individual before course commencement. Partial transfers are not permitted.',
    makeup: 'You are allowed to reschedule up to three (3) make-up classes, subject to cohort schedule and availability. You must reschedule more than twenty-four (24) hours before class starts. Missed classes are forfeited. A $20 no-show fee applies for missed make-up classes. A $40 fee applies per make-up class outside your cohort schedule (glazing excluded).',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'wt-7week-inter': {
    title: '7-Week Intermediate Wheelthrowing',
    description: [
      { heading: 'Pre-requisite', text: 'Completion of the 6-Week Beginner/Extension Course with the ability to throw 700g S-forms comfortably.' },
      'A seven-week course (2.5 hours per class per week) for students who have completed at least three beginner/extension courses. Students work with heavier clay weights to throw larger cylinders, bowls, bottle forms, vases, and sets, with a focus on precision, control, and consistency.',
      { heading: 'Weeks 1–2 — Intro to Ramen Bowls', items: [
        'Craft ramen bowls on the wheel by throwing.',
        'In the second week, perfect your bowls by turning the feet.',
      ]},
      { heading: 'Weeks 3–4 — Intro to Narrow Neck Forms', items: [
        'Learn the techniques for creating narrow neck forms.',
        'Master the art of trimming these pieces.',
      ]},
      { heading: 'Weeks 5–6 — Craft a Set', items: [
        'Take on the challenge to craft identical pieces for a coordinated set.',
        'Practise the intricacies of trimming.',
      ]},
      { heading: 'Week 7 — Glazing', items: [
        'Glaze your wares with Ves\'s in-house glazes.',
      ]},
    ],
    fees: 'Unlimited usage of clay, up to 8 finished pieces, use of wheel and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: 'To ensure individualised attention, class size is limited to eight (8) students, with two (2) additional wheels reserved for make-up classes only. All course fees are strictly non-refundable. Students may transfer their entire course enrolment to another individual before course commencement. Partial transfers are not permitted.',
    makeup: 'You are allowed to reschedule up to three (3) make-up classes, subject to cohort schedule and availability. You must reschedule more than twenty-four (24) hours before class starts. Missed classes are forfeited. A $20 no-show fee applies for missed make-up classes. A $40 fee applies per make-up class outside your cohort schedule (glazing excluded).',
    items: COMMON_ITEMS,
    rules: COMMON_RULES,
  },
  'hb-4credit': {
    title: 'Handbuilding 4-Week Course',
    description: [
      'A four-week handbuilding course (2.5 hours per class per week) introducing the fundamentals of working with clay by hand. Students progress through core techniques — pinching, coiling, and slab-making — before finishing with an introduction to glazing.',
      { heading: 'Week 1 — Pinching', items: [
        'Learn the fundamentals of pinching technique and form control.',
        'Create your first functional pieces — cups and small vessels.',
      ]},
      { heading: 'Week 2 — Coiling', items: [
        'Build larger pieces using coiling techniques.',
        'Learn to connect and blend separate clay bodies for seamless joins.',
      ]},
      { heading: 'Week 3 — Slab-Making', items: [
        'Create flatware and structured forms using rolled slabs.',
        'Explore decorating techniques — carving, incising, and surface attachments.',
      ]},
      { heading: 'Week 4 — Glazing', items: [
        'Introduction to glaze theory and application methods.',
        'Apply in-studio Ves glazes to your bisque-fired pieces for the final kiln firing.',
      ]},
    ],
    fees: 'Unlimited usage of clay, up to 5 finished pieces of 600g each or 3000g combined, use of tools and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: null,
    makeup: null,
    items: [
      'Apron — not required; Ves branded aprons available ($45)',
      'Tote Bag — recommended for transporting finished work. Ves totes available ($12)',
    ],
    rules: COMMON_RULES,
  },
  'hb-8credit': {
    title: 'Handbuilding 8-Week Course',
    description: [
      'An eight-week handbuilding course (2.5 hours per class per week) that builds on the four-week programme, introducing sculpting, detailing, and advanced techniques alongside the core foundations.',
      { heading: 'Weeks 1–3 — Foundations', items: [
        'Week 1 — Pinching: learn form control and create cups and small vessels.',
        'Week 2 — Coiling: build larger pieces and learn seamless joining techniques.',
        'Week 3 — Slab-Making: create flatware and explore surface decoration.',
      ]},
      { heading: 'Weeks 4–5 — Sculpting', items: [
        'Introduction to the foundations of sculptural form and structure.',
        'Explore techniques for building three-dimensional clay work.',
      ]},
      { heading: 'Weeks 6–7 — Detailing', items: [
        'Learn to shape facial forms and figurative elements.',
        'Develop expression and personality in sculptural pieces.',
      ]},
      { heading: 'Week 8 — Glazing', items: [
        'Introduction to glaze theory and application methods.',
        'Apply in-studio Ves glazes to your bisque-fired pieces for the final kiln firing.',
      ]},
    ],
    fees: 'Unlimited usage of clay, up to 9 finished pieces of 600g each or 4500g combined, use of tools and equipment, materials for decorating and glazing, and firing. Additional tools and pieces made are subject to additional costs.',
    classSize: null,
    makeup: null,
    items: [
      'Apron — not required; Ves branded aprons available ($45)',
      'Tote Bag — recommended for transporting finished work. Ves totes available ($12)',
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
  coursePolicy: {
    title: 'Course Policy',
    items: [
      'All course fees are strictly non-refundable.',
      'If you are unable to attend the entire course, you may transfer your enrolment to another individual before course commencement. Partial transfers are not permitted.',
    ],
  },
  rescheduling: {
    title: 'Rescheduling & Attendance',
    description: 'While we cannot guarantee make-up classes, each student may arrange make-up sessions subject to the following conditions.',
    items: [
      'Each student may reschedule up to three (3) make-up classes, subject to cohort schedule and availability.',
      'Make-up classes must be rescheduled more than twenty-four (24) hours before the scheduled start time.',
      'Missed course classes are forfeited — no credit will be given for unattended course classes.',
      'A $20 no-show fee applies if you miss a rescheduled make-up class, as your spot could have gone to another student.',
      'A $40 fee applies per make-up class outside of your cohort schedule. There is no fee to reschedule final glazing classes.',
    ],
  },
  punctuality: {
    title: 'Punctuality',
    items: [
      'As this is a structured course, punctuality is expected of all students.',
      'The studio opens for entry ten (10) minutes before class begins. Classes will begin and end on time.',
    ],
  },
  itemsRequired: {
    title: 'Required Items',
    items: [
      'Pottery Tool Set — required; bring your own or purchase from Ves ($18).',
      'Apron — required; not provided by the studio. Ves branded aprons available ($45).',
      'Tote Bag — recommended for transporting finished work. Ves totes available ($12).',
      'Advanced Trimming Tool — optional add-on for intermediate students ($12).',
    ],
  },
  rescheduling: {
    title: 'Rescheduling & Attendance',
    items: [
      'You are allowed to reschedule up to 3 makeup classes subject to cohort schedule and availability.',
      'You must reschedule a makeup class more than 24 hours before it starts.',
      'Missed course classes are forfeited — no credit will be given for unattended course classes.',
      'A $20 no-show fee applies if you miss a rescheduled makeup class, as your makeup spot could have gone to another student.',
      'A $40 fee applies per makeup class outside of your cohort schedule. There is no fee requirement to reschedule final glazing classes.',
    ],
  },
  studioRules: {
    title: 'Studio Etiquette',
    items: [
      'Upon arrival, press the doorbell. A staff member will attend to you.',
      'All work must be clearly initialled using three (3) characters (letters or numbers) to prevent mix-ups.',
      'Please clean your workspace after each session, including wiping down your seat and wheel.',
      'Students who are unwell are asked to wear a mask while in the studio.',
      'Comfortable clothing and closed-toe shoes are required.',
      'Please ensure fingernails are trimmed appropriately for working with clay.',
      'Food and beverages (other than water) are not permitted in the studio.',
      'Students under the age of 16 must notify the studio in advance of enrolment.',
    ],
  },
  additionalServices: {
    title: 'Additional Pieces & Studio Access',
    items: [
      'Students wishing to produce more than the included number of pieces may do so at $20 per additional piece.',
      'Unguided studio access is available to current students at $20 per hour, with a minimum booking of two (2) hours (full-hour increments only).',
    ],
  },
  returningCredits: {
    title: 'Returning Student Credits',
    highlight: true,
    items: [
      'All returning students receive $20 in studio credits for each wheelthrowing course completed.',
      'Credits may be applied towards additional pieces, studio access bookings, or a discount on your next course enrolment.',
    ],
  },
  collectionAndDisposal: {
    title: 'Collection & Disposal',
    items: [
      'Collection of finished pieces is by appointment only, within one (1) month after your final class.',
      'The studio reserves the right to dispose of uncollected pieces after three (3) months.',
      'It is the student\'s responsibility to arrange timely collection. Please contact us to schedule.',
    ],
  },
  general: {
    title: 'General Policy',
    items: [
      'Ves Pottery Studio reserves the right to refuse service, blacklist, or ban any individual who fails to comply with studio rules, or who engages in illegal, disruptive, or inappropriate conduct on the premises.',
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
  if (courseType.includes('handbuilding')) {
    return weeks <= 4 ? COURSE_DETAILS['hb-4credit'] : COURSE_DETAILS['hb-8credit'];
  }
  if (weeks === 10) return COURSE_DETAILS['wt-10class'];
  if (weeks >= 18 || title.includes('3 course')) return COURSE_DETAILS['wt-3x6week'];
  if (weeks === 7 || courseType.includes('intermediate')) return COURSE_DETAILS['wt-7week-inter'];
  return COURSE_DETAILS['wt-6week'];
}

export { STUDIO_ADDRESS, STUDIO_MAP_URL };
