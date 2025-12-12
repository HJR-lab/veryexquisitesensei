require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function updateWheelthrowingCourses() {
  // First, delete all existing non-handbuilding classes (the test data)
  console.log('🗑️  Removing old test wheelthrowing data...');
  const { error: deleteError } = await supabase
    .from('class_instances')
    .delete()
    .neq('class_type', 'Handbuilding');

  if (deleteError) {
    console.error('❌ Error deleting old data:', deleteError);
    process.exit(1);
  }

  // Now add the actual wheelthrowing courses from Shopify
  console.log('➕ Adding actual wheelthrowing courses from Shopify...');

  const courses = [
    // TUESDAYS • 21 Oct – 25 Nov • 7:00pm-9:30pm (6 weeks)
    {class_date: '2025-10-21', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-28', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-04', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-11', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-18', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-25', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},

    // THURSDAYS • 16 Oct – 20 Nov • 7:00pm-9:30pm (6 weeks)
    {class_date: '2025-10-16', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-23', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-30', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-06', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-13', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-20', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},

    // FRIDAYS • 10 Oct – 14 Nov • 9:30am-12:00pm (6 weeks)
    {class_date: '2025-10-10', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio B', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-17', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio B', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-24', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio B', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-31', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio B', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-07', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio B', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-14', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio B', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},

    // SATURDAYS • 4 Oct – 8 Nov • 9:30am-12:00pm (6 weeks)
    {class_date: '2025-10-04', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-11', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-18', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-25', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-01', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-08', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Jean', room: 'Main Studio', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},

    // SATURDAYS • 20 Sept – 25 Oct • 1:00pm-3:30pm (6 weeks)
    {class_date: '2025-09-20', start_time: '1:00 PM', end_time: '3:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-09-27', start_time: '1:00 PM', end_time: '3:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-04', start_time: '1:00 PM', end_time: '3:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-11', start_time: '1:00 PM', end_time: '3:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-18', start_time: '1:00 PM', end_time: '3:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-25', start_time: '1:00 PM', end_time: '3:30 PM', class_type: 'Wheelthrowing', instructor: 'Daesiree', room: 'Studio A', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},

    // SUNDAYS • 12 Oct – 16 Nov • 9:30am-12:00pm (6 weeks)
    {class_date: '2025-10-12', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio C', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-19', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio C', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-10-26', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio C', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-02', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio C', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-09', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio C', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-11-16', start_time: '9:30 AM', end_time: '12:00 PM', class_type: 'Wheelthrowing', instructor: 'Dillion', room: 'Studio C', max_capacity: 8, current_enrollment: 8, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
  ];

  const { data, error } = await supabase
    .from('class_instances')
    .insert(courses)
    .select();

  if (error) {
    console.error('❌ Error adding courses:', error);
    process.exit(1);
  }

  console.log(`✅ Successfully added ${data.length} wheelthrowing classes across 6 courses`);
  console.log('\n📊 Course Summary:');
  console.log('  • TUESDAYS 7:00pm-9:30pm (6 classes)');
  console.log('  • THURSDAYS 7:00pm-9:30pm (6 classes)');
  console.log('  • FRIDAYS 9:30am-12:00pm (6 classes)');
  console.log('  • SATURDAYS 9:30am-12:00pm (6 classes)');
  console.log('  • SATURDAYS 1:00pm-3:30pm (6 classes)');
  console.log('  • SUNDAYS 9:30am-12:00pm (6 classes)');
  console.log('\n✨ All courses marked as SOLD OUT (8/8 enrolled)');

  process.exit(0);
}

updateWheelthrowingCourses();
