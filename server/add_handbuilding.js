require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function addHandbuildingClasses() {
  const classes = [
    // November 2025
    {class_date: '2025-11-05', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    // December 2025
    {class_date: '2025-12-03', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-12-10', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-12-17', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-12-24', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2025-12-31', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    // January 2026
    {class_date: '2026-01-07', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2026-01-14', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2026-01-21', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2026-01-28', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    // February 2026
    {class_date: '2026-02-04', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2026-02-11', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2026-02-18', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2026-02-25', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    // March 2026
    {class_date: '2026-03-04', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2026-03-11', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2026-03-18', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
    {class_date: '2026-03-25', start_time: '7:00 PM', end_time: '9:30 PM', class_type: 'Handbuilding', instructor: 'Jean', room: 'Studio A', max_capacity: 10, current_enrollment: 0, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString()},
  ];

  const { data, error } = await supabase
    .from('class_instances')
    .upsert(classes, { onConflict: 'class_date,start_time,room', ignoreDuplicates: true })
    .select();

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } else {
    console.log('✅ Successfully added', data.length, 'Wednesday handbuilding classes');
    process.exit(0);
  }
}

addHandbuildingClasses();
