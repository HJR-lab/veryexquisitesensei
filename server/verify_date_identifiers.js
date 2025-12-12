require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data, error } = await supabase
    .from('class_instances')
    .select('class_date, class_type')
    .order('class_date', { ascending: true });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('\nVerifying course identifiers (grouped by course):\n');

  // Group classes by base course identifier (everything before the week number)
  const courses = new Map();

  data.forEach(cls => {
    // Extract base identifier (e.g., "WT1801AM_DL6" from "WT1801AM_DL6.1")
    const baseMatch = cls.class_type.match(/^(.+)\.\d+$/);
    const baseIdentifier = baseMatch ? baseMatch[1] : cls.class_type;

    if (!courses.has(baseIdentifier)) {
      courses.set(baseIdentifier, []);
    }
    courses.get(baseIdentifier).push(cls);
  });

  let allCorrect = true;

  // Verify each course
  for (const [baseIdentifier, classes] of courses) {
    // Sort classes by date
    classes.sort((a, b) => new Date(a.class_date) - new Date(b.class_date));

    // Extract date code from identifier
    const dateMatch = baseIdentifier.match(/^[A-Z]{2}(\d{4})/);
    const identifierDateCode = dateMatch ? dateMatch[1] : null;

    // Get the first class date
    const firstClassDateParts = classes[0].class_date.split('T')[0].split('-');
    const expectedDateCode = firstClassDateParts[2] + firstClassDateParts[1]; // DDMM

    const isCorrect = identifierDateCode === expectedDateCode;
    const status = isCorrect ? '✅' : '❌';

    if (!isCorrect) allCorrect = false;

    console.log(`${status} ${baseIdentifier} | First class: ${classes[0].class_date.split('T')[0]} | Expected: ${expectedDateCode} | Actual: ${identifierDateCode} | ${classes.length} classes`);
  }

  console.log(`\n${allCorrect ? '🎉 All course identifiers match first class dates!' : '⚠️  Some course identifiers do not match'}`);
  process.exit(0);
})();
