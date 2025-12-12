require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkJessie() {
  // Find Jessie in database
  const { data: jessie } = await supabase
    .from('customers')
    .select('*')
    .eq('email', 'jessieong326@yahoo.com')
    .single();
  
  console.log('Jessie Ong in database:');
  console.log(jessie);
  
  if (jessie) {
    // Check if she has any bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        attended,
        created_at,
        class_instance:class_instances!bookings_class_instance_id_fkey (
          id,
          class_date,
          class_type
        )
      `)
      .eq('student_id', jessie.id);
    
    console.log('\nJessie\'s bookings:');
    console.log(bookings);
    
    const attendedCount = bookings?.filter(b => b.attended === true).length || 0;
    console.log(`\nClasses attended: ${attendedCount}`);
  }
  
  process.exit(0);
}

checkJessie().catch(console.error);
