require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function enrollJoeyInTuesdayWT() {
  try {
    console.log('\n🔍 Finding Joey Lee...\n');

    // Get Joey Lee's customer record
    const { data: joey, error: joeyError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'joey.lee2302@gmail.com')
      .single();

    if (joeyError || !joey) {
      console.error('❌ Joey Lee not found:', joeyError);
      return;
    }

    console.log('✅ Found Joey Lee (ID:', joey.id, ')');
    console.log('   Classes allocated:', joey.classes_allocated);
    console.log('   Classes used:', joey.classes_used);

    // Find Tuesday WT classes in Jan 17 - Mar 3, 2026 cohort
    console.log('\n🔍 Finding Tuesday WT classes (Jan 17 - Mar 3, 2026)...\n');

    const { data: classes, error: classError } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2026-01-17')
      .lte('class_date', '2026-03-03')
      .ilike('class_type', '%WT%')
      .order('class_date', { ascending: true });

    if (classError) {
      console.error('❌ Error finding classes:', classError);
      return;
    }

    // Filter for Tuesday classes only (day of week = 2)
    const tuesdayClasses = classes.filter(cls => {
      const date = new Date(cls.class_date);
      return date.getDay() === 2; // Tuesday
    });

    console.log('Found', tuesdayClasses.length, 'Tuesday WT classes');

    if (tuesdayClasses.length === 0) {
      console.log('❌ No Tuesday WT classes found in this cohort period');
      return;
    }

    // Group by course identifier (base identifier without .X week number)
    // e.g., "WT2001NT_JL6.1" -> "WT2001NT_JL6"
    const courseGroups = {};
    tuesdayClasses.forEach(cls => {
      const baseIdentifier = cls.class_type.split('.')[0];
      if (!courseGroups[baseIdentifier]) {
        courseGroups[baseIdentifier] = [];
      }
      courseGroups[baseIdentifier].push(cls);
    });

    // Show available courses
    console.log('\nAvailable Tuesday WT courses:');
    Object.entries(courseGroups).forEach(([identifier, classes]) => {
      console.log(`\n${identifier}:`);
      console.log(`  ${classes[0].start_time} - ${classes[0].end_time}`);
      console.log(`  ${classes.length} weeks`);
      console.log(`  Instructor: ${classes[0].instructor}`);
    });

    // Use the first Tuesday course (there should be one Tuesday WT course)
    const courseIdentifier = Object.keys(courseGroups)[0];
    const courseClasses = courseGroups[courseIdentifier];

    if (!courseClasses || courseClasses.length === 0) {
      console.log('❌ No Tuesday WT course found');
      return;
    }

    console.log(`\n📚 Enrolling Joey in: ${courseIdentifier}\n`);

    // Sort by date to ensure we enroll in order
    courseClasses.sort((a, b) => new Date(a.class_date) - new Date(b.class_date));

    // Enroll in all 6 weeks
    let enrolled = 0;
    for (const classInstance of courseClasses) {
      // Extract week number from identifier like "WT2001NT_JL6.1" -> 1
      const weekNumber = classInstance.class_type.split('.')[1] || '?';
      console.log(`Adding to Week ${weekNumber}: ${new Date(classInstance.class_date).toLocaleDateString()}`);

      const { error: bookingError } = await supabaseDb.supabase
        .from('bookings')
        .insert({
          student_id: joey.id,
          class_instance_id: classInstance.id,
          booking_date: new Date().toISOString(),
          status: 'booked',
          booking_type: 'regular',
          is_makeup_class: false,
          advance_notice_given: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (bookingError) {
        // Skip if already enrolled (duplicate key error)
        if (bookingError.code === '23505') {
          console.log(`  ⏭️  Already enrolled in week ${weekNumber}, skipping...`);
        } else {
          console.error(`  ❌ Error enrolling in week ${weekNumber}:`, bookingError);
        }
      } else {
        console.log(`  ✅ Enrolled!`);
        enrolled++;
      }
    }

    console.log(`\n✨ Successfully enrolled Joey in ${enrolled}/${courseClasses.length} weeks!`);

    // Update classes_used
    const { error: updateError } = await supabaseDb.supabase
      .from('customers')
      .update({
        classes_used: enrolled,
        updated_at: new Date().toISOString()
      })
      .eq('id', joey.id);

    if (updateError) {
      console.error('❌ Error updating classes_used:', updateError);
    } else {
      console.log(`✅ Updated Joey's classes_used to ${enrolled}`);
    }

    console.log('\n🎉 Joey Lee is now enrolled in the Tuesday WT course!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

enrollJoeyInTuesdayWT();
