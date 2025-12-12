const {
  parseCourseInfo,
  generateClassDates,
  generateCohortId,
  createClassInstances
} = require('./utils/courseScheduler');

console.log('\n🧪 Testing Course Scheduler Utilities\n');

// Test 1: Parse simple course info
console.log('Test 1: Parse "6 weeks TUESDAYS | 20 Oct - 24 Nov"');
const test1 = parseCourseInfo(
  'Wheelthrowing Beginner Course',
  '6 weeks TUESDAYS | 20 Oct - 24 Nov'
);
console.log(JSON.stringify(test1, null, 2));

// Test 2: Parse with time
console.log('\n\nTest 2: Parse "6 weeks WEDNESDAYS 7:00 PM - 9:30 PM | 15 October - 19 November"');
const test2 = parseCourseInfo(
  'Handbuilding Intermediate Course',
  '6 weeks WEDNESDAYS 7:00 PM - 9:30 PM | 15 October - 19 November'
);
console.log(JSON.stringify(test2, null, 2));

// Test 3: Generate class dates
console.log('\n\nTest 3: Generate class dates for Test 1');
const dates1 = generateClassDates(test1);
console.log(`Generated ${dates1.length} dates:`);
dates1.forEach((date, idx) => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  console.log(`  Week ${idx + 1}: ${date.toISOString().split('T')[0]} (${dayNames[date.getDay()]})`);
});

// Test 4: Generate cohort ID
console.log('\n\nTest 4: Generate cohort ID for Test 1');
const cohortId1 = generateCohortId(test1);
console.log(`Cohort ID: ${cohortId1}`);

// Test 5: Create class instances
console.log('\n\nTest 5: Create class instances for Test 1');
const instances1 = createClassInstances(test1);
console.log(`Created ${instances1.length} class instances:`);
instances1.forEach((instance, idx) => {
  console.log(`  ${idx + 1}. ${instance.class_date} ${instance.start_time}-${instance.end_time} - ${instance.class_type}`);
});

console.log('\n\n✅ All tests complete!');
