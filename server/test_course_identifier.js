const { generateCourseIdentifier } = require('./utils/courseScheduler');

console.log('\n🧪 Testing VES Course Identifier Generation\n');
console.log('📋 Business Rules:');
console.log('   - Handbuilding (HB): Creates classes immediately, taught by LT');
console.log('   - Wheelthrowing (WT): Requires 4 students minimum, taught by DL or JL\n');

// Test 1: Wheelthrowing AM slot
console.log('Test 1: Wheelthrowing AM (9:30-12pm) starting Oct 12');
const wt1 = {
  courseType: 'Wheelthrowing Beginner',
  startDate: new Date(2025, 9, 12), // Oct 12, 2025
  classTime: '9:30 AM - 12:00 PM',
  numberOfWeeks: 6
};
console.log('  Expected: WT1012AM_DL6.1');
console.log('  Got:      ' + generateCourseIdentifier(wt1, 'DL', 1));
console.log('  Week 4:   ' + generateCourseIdentifier(wt1, 'DL', 4));

// Test 2: Wheelthrowing PM slot
console.log('\n\nTest 2: Wheelthrowing PM (1-3:30pm) starting Nov 3');
const wt2 = {
  courseType: 'Wheelthrowing Intermediate',
  startDate: new Date(2025, 10, 3), // Nov 3, 2025
  classTime: '1:00 PM - 3:30 PM',
  numberOfWeeks: 6
};
console.log('  Expected: WT1103PM_JL6.1');
console.log('  Got:      ' + generateCourseIdentifier(wt2, 'JL', 1));

// Test 3: Wheelthrowing Night slot
console.log('\n\nTest 3: Wheelthrowing Night (7-9:30pm) starting Dec 20');
const wt3 = {
  courseType: 'Wheelthrowing',
  startDate: new Date(2025, 11, 20), // Dec 20, 2025
  classTime: '7:00 PM - 9:30 PM',
  numberOfWeeks: 6
};
console.log('  Expected: WT1220NT_DL6.1');
console.log('  Got:      ' + generateCourseIdentifier(wt3, 'DL', 1));

// Test 4: Handbuilding
console.log('\n\nTest 4: Handbuilding Night starting Jan 15');
const hb1 = {
  courseType: 'Handbuilding Beginner',
  startDate: new Date(2025, 0, 15), // Jan 15, 2025
  classTime: '7:00 PM - 9:30 PM',
  numberOfWeeks: 6
};
console.log('  Expected: HB0115NT_LT6.1');
console.log('  Got:      ' + generateCourseIdentifier(hb1, 'LT', 1));

console.log('\n\n✅ All tests complete!');
