require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkJuneClass() {
  try {
    // Check what class is on June 11 (0611)
    const { data: classes } = await supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2025-06-11')
      .lte('class_date', '2025-06-11')
      .order('start_time', { ascending: true });

    console.log('Classes on June 11, 2025:\n');
    for (const cls of classes) {
      const date = new Date(cls.class_date);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[date.getDay()];
      
      console.log(cls.class_date + ' (' + dayName + ') ' + cls.start_time + ' - ' + cls.instructor + ' (' + cls.class_type + ')');
    }

    // Now check Celine's bookings
    const { data: celine } = await supabase
      .from('customers')
      .select('id')
      .eq('email', 'leongs.celine@gmail.com')
      .single();

    if (celine) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('class_instances(*)')
        .eq('student_id', celine.id)
        .order('class_instances(class_date)', { ascending: true });

      console.log('\nCeline bookings:');
      for (const booking of bookings) {
        const cls = booking.class_instances;
        const date = new Date(cls.class_date);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = dayNames[date.getDay()];
        
        console.log(cls.class_date + ' (' + dayName + ') ' + cls.start_time + ' - ' + cls.instructor);
      }
    }

    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkJuneClass();
