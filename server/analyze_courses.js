require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function analyzeCourses() {
  try {
    console.log('Analyzing Oct 10 classes\n');

    // Get all classes on Oct 10-12
    const { data: classes } = await supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2025-10-10')
      .lte('class_date', '2025-10-12')
      .eq('start_time', '9:30 AM')
      .order('class_date', { ascending: true });

    console.log('Classes on Oct 10-12 at 9:30 AM:');
    for (const cls of classes) {
      console.log('  ' + cls.class_date + ' - ' + cls.instructor);
    }

    // Check the Oct 10 class in detail
    const oct10Class = classes.find(c => c.class_date.startsWith('2025-10-10'));
    
    const { data: bookings } = await supabase
      .from('bookings')
      .select('student_id, customers(email)')
      .eq('class_instance_id', oct10Class.id);

    console.log('\n14 Students in Oct 10 class:');
    bookings.forEach((b, i) => {
      console.log('  ' + (i + 1) + '. ' + b.customers.email);
    });

    // Now check which of these students are in Oct 17 (next Friday)
    const oct17Class = await supabase
      .from('class_instances')
      .select('*')
      .eq('class_date', '2025-10-17')
      .eq('start_time', '9:30 AM')
      .eq('instructor', 'Dillon Lin')
      .single();

    const { data: oct17Bookings } = await supabase
      .from('bookings')
      .select('student_id, customers(email)')
      .eq('class_instance_id', oct17Class.data.id);

    console.log('\nStudents in Oct 17 class (week 2 of Friday course):');
    oct17Bookings.forEach((b, i) => {
      console.log('  ' + (i + 1) + '. ' + b.customers.email);
    });

    // Check Oct 18 (Saturday week 2)
    const oct18Class = await supabase
      .from('class_instances')
      .select('*')
      .eq('class_date', '2025-10-18')
      .eq('start_time', '9:30 AM')
      .eq('instructor', 'Dillon Lin')
      .single();

    const { data: oct18Bookings } = await supabase
      .from('bookings')
      .select('student_id, customers(email)')
      .eq('class_instance_id', oct18Class.data.id);

    console.log('\nStudents in Oct 18 class (week 2 of Saturday course):');
    oct18Bookings.forEach((b, i) => {
      console.log('  ' + (i + 1) + '. ' + b.customers.email);
    });

    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

analyzeCourses();
