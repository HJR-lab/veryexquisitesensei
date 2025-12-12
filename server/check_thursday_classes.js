require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkThursdayClasses() {
  const { data: classes } = await supabase
    .from('class_instances')
    .select('*')
    .eq('start_time', '7:00 PM')
    .eq('instructor', 'Joyce Lim')
    .ilike('class_type', '%wheelthrowing%')
    .order('class_date', { ascending: true });

  console.log('All Thursday 7PM Joyce Lim wheelthrowing classes:\n');
  
  for (const cls of classes) {
    const date = new Date(cls.class_date);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[date.getDay()];
    
    if (date.getDay() === 4) { // Thursday
      console.log(cls.class_date + ' (' + dayName + ')');
    }
  }

  process.exit(0);
}

checkThursdayClasses();
