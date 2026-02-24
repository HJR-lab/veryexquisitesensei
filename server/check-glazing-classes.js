require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkGlazingClasses() {
  try {
    console.log('Checking for all 6.6 glazing classes...\n');

    const { data: classes, error } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .ilike('class_type', '%6.6%')
      .order('class_date', { ascending: true });

    if (error) throw error;

    console.log(`Found ${classes.length} glazing classes (Week 6.6):\n`);

    const today = new Date();
    const twentyFourHoursFromNow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    classes.forEach(cls => {
      const classDate = new Date(cls.class_date);
      const isPast = classDate < today;
      const isWithin24h = classDate < twentyFourHoursFromNow && classDate >= today;

      console.log(`ID: ${cls.id}`);
      console.log(`  Type: ${cls.class_type}`);
      console.log(`  Date: ${cls.class_date}`);
      console.log(`  Time: ${cls.start_time}`);
      console.log(`  Instructor: ${cls.instructor}`);
      console.log(`  Status: ${isPast ? 'PAST' : isWithin24h ? 'WITHIN 24H' : 'AVAILABLE'}`);
      console.log('');
    });

    const pastCount = classes.filter(c => new Date(c.class_date) < today).length;
    const within24hCount = classes.filter(c => {
      const d = new Date(c.class_date);
      return d < twentyFourHoursFromNow && d >= today;
    }).length;
    const availableCount = classes.filter(c => new Date(c.class_date) >= twentyFourHoursFromNow).length;

    console.log('\nSummary:');
    console.log(`  Past: ${pastCount}`);
    console.log(`  Within 24h: ${within24hCount}`);
    console.log(`  Available (24h+): ${availableCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkGlazingClasses();
