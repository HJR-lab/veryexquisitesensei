require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function testYeoStats() {
  console.log('\n=== TESTING YEO\'S STATS ===\n');

  // Find Yeo's customer record
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('email', 'samanthayeo93@gmail.com')
    .single();

  if (!customer) {
    console.log('❌ Yeo not found');
    return;
  }

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('Email:', customer.email);
  console.log('Classes Allocated:', customer.classes_allocated);
  console.log('Classes Used (DB):', customer.classes_used);

  // Get all bookings for Yeo
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date,
        end_time
      )
    `)
    .eq('student_id', customer.id)
    .in('status', ['booked', 'completed', 'attended'])
    .order('class_instances(class_date)', { ascending: true });

  console.log('\n📚 All Bookings:');
  console.log('Total bookings:', bookings.length);

  const now = new Date();
  let endedCount = 0;

  bookings.forEach((b, index) => {
    const ci = b.class_instances;
    if (!ci) return;

    const classDate = ci.class_date.split('T')[0];
    const endTime = ci.end_time;

    const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);
    if (!timeParts) return;

    let hours = parseInt(timeParts[1]);
    const minutes = parseInt(timeParts[2]);
    const period = timeParts[3].toLowerCase();

    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    const [year, month, day] = classDate.split('-');
    const classEndDateTime = new Date(year, month - 1, day, hours, minutes);

    const hasEnded = classEndDateTime < now;
    if (hasEnded) endedCount++;

    console.log(`\n  ${index + 1}. ${ci.class_type}`);
    console.log(`     Date: ${classDate}, End: ${endTime}`);
    console.log(`     Status: ${b.status}`);
    console.log(`     Has Ended?: ${hasEnded ? '✅ YES' : '❌ NO'}`);
  });

  console.log('\n\n📊 CALCULATED STATS:');
  console.log('Ended Classes:', endedCount);
  console.log('Classes Remaining:', customer.classes_allocated - endedCount);
}

testYeoStats().then(() => process.exit());
