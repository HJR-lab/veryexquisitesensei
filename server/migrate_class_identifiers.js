require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');
const { generateCourseIdentifier } = require('./utils/courseScheduler');
const { getInstructorForCourse } = require('./utils/courseEnrollmentManager');

async function migrateClassIdentifiers() {
  console.log('\n🔄 Migrating class instances to VES course identifier format...\n');

  // Get all class instances
  const { data: classInstances, error } = await supabase
    .from('class_instances')
    .select('*')
    .order('class_date', { ascending: true });

  if (error) {
    console.error('❌ Error fetching class instances:', error);
    return;
  }

  console.log(`📊 Found ${classInstances.length} class instances to migrate\n`);

  // Group class instances by course type and start date to generate cohort-based identifiers
  const cohorts = {};

  classInstances.forEach(instance => {
    // Parse course type from class_type
    // Examples: "Wheelthrowing Beginner (Week 1/6)", "Handbuilding (Week 2/6)"
    const match = instance.class_type.match(/^(.+?)\s*\(Week\s+(\d+)\/(\d+)\)/);

    if (!match) {
      console.log(`⚠️  Skipping instance ${instance.id}: Cannot parse class_type "${instance.class_type}"`);
      return;
    }

    const courseType = match[1].trim();
    const weekNumber = parseInt(match[2]);
    const totalWeeks = parseInt(match[3]);

    // Calculate start date based on current date and week number
    const currentDate = new Date(instance.class_date);
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - (weekNumber - 1) * 7);

    // Create cohort key
    const cohortKey = `${courseType}_${startDate.toISOString().split('T')[0]}`;

    if (!cohorts[cohortKey]) {
      cohorts[cohortKey] = {
        courseType,
        startDate,
        numberOfWeeks: totalWeeks,
        classTime: instance.start_time && instance.end_time ?
          `${instance.start_time} - ${instance.end_time}` : null,
        instances: []
      };
    }

    cohorts[cohortKey].instances.push({
      id: instance.id,
      weekNumber,
      instructor: instance.instructor
    });
  });

  console.log(`🎓 Identified ${Object.keys(cohorts).length} course cohorts\n`);

  // Update each cohort
  let updatedCount = 0;

  for (const [cohortKey, cohort] of Object.entries(cohorts)) {
    console.log(`\n📚 Processing cohort: ${cohort.courseType} starting ${cohort.startDate.toISOString().split('T')[0]}`);
    console.log(`   ${cohort.instances.length} class instances`);

    // Get instructor code for this course type
    const instructor = getInstructorForCourse(cohort.courseType);
    console.log(`   Instructor: ${instructor.name} (${instructor.code})`);

    // Update each instance in the cohort
    for (const instance of cohort.instances) {
      // Generate course identifier
      const courseInfo = {
        courseType: cohort.courseType,
        startDate: cohort.startDate,
        classTime: cohort.classTime,
        numberOfWeeks: cohort.numberOfWeeks
      };

      const courseIdentifier = generateCourseIdentifier(
        courseInfo,
        instructor.code,
        instance.weekNumber
      );

      if (!courseIdentifier) {
        console.log(`   ⚠️  Could not generate identifier for instance ${instance.id}`);
        continue;
      }

      // Update the class instance
      const { error: updateError } = await supabase
        .from('class_instances')
        .update({ class_type: courseIdentifier })
        .eq('id', instance.id);

      if (updateError) {
        console.error(`   ❌ Error updating instance ${instance.id}:`, updateError);
      } else {
        console.log(`   ✅ Updated instance ${instance.id}: ${courseIdentifier}`);
        updatedCount++;
      }
    }
  }

  console.log(`\n🎉 Migration complete! Updated ${updatedCount} class instances\n`);
  process.exit(0);
}

migrateClassIdentifiers();
