require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixWT2802Location() {
  try {
    console.log('Fixing WT2802PM location from JL6 to DL6...\n');

    // Get all WT2802PM_JL6 classes
    const { data: classes, error: classError } = await supabase
      .from('class_instances')
      .select('*')
      .ilike('class_type', 'WT2802PM_JL6%');

    if (classError) {
      console.error('Error fetching classes:', classError);
      return;
    }

    console.log(`Found ${classes.length} classes to update:`);
    classes.forEach(c => {
      console.log(`  - ${c.class_type} on ${c.class_date}`);
    });

    // Update class_type from JL6 to DL6
    for (const cls of classes) {
      const newClassType = cls.class_type.replace('_JL6', '_DL6');

      const { error: updateError } = await supabase
        .from('class_instances')
        .update({ class_type: newClassType })
        .eq('id', cls.id);

      if (updateError) {
        console.error(`Error updating class ${cls.id}:`, updateError);
      } else {
        console.log(`✓ Updated: ${cls.class_type} → ${newClassType}`);
      }
    }

    // Also update any enrollments
    const { data: enrollments, error: enrollError } = await supabase
      .from('course_enrollments')
      .select('*')
      .ilike('course_identifier', 'WT2802PM_JL6%');

    if (enrollments && enrollments.length > 0) {
      console.log(`\nFound ${enrollments.length} enrollments to update:`);

      for (const enrollment of enrollments) {
        const newIdentifier = enrollment.course_identifier.replace('_JL6', '_DL6');

        const { error: updateError } = await supabase
          .from('course_enrollments')
          .update({ course_identifier: newIdentifier })
          .eq('id', enrollment.id);

        if (updateError) {
          console.error(`Error updating enrollment ${enrollment.id}:`, updateError);
        } else {
          console.log(`✓ Updated enrollment: ${enrollment.course_identifier} → ${newIdentifier}`);
        }
      }
    }

    console.log('\n✅ Update complete!');
    console.log('Note: Weekend WT classes use DL (Dhoby Lane), Weekday WT classes use JL (Jalan Legundi), HB classes use LT (Lower Terrace)');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fixWT2802Location();
