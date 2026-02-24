require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkHBClasses() {
  try {
    // Check for HB classes (format: HB_DDMMYY_LT)
    const { data: hbClasses, error: hbError } = await supabase
      .from('class_instances')
      .select('*')
      .like('class_type', 'HB_%')
      .gte('class_date', new Date().toISOString().split('T')[0])
      .order('class_date', { ascending: true })
      .limit(20);

    if (hbError) {
      console.error('Error fetching HB classes:', hbError);
    } else {
      console.log('\n=== HANDBUILDING CLASSES (HB_*) ===');
      console.log(`Found ${hbClasses?.length || 0} upcoming HB classes\n`);

      if (hbClasses && hbClasses.length > 0) {
        console.log('First 20 upcoming classes:');
        hbClasses.forEach(cls => {
          console.log(`  ${cls.class_date} ${cls.start_time}-${cls.end_time} | ${cls.class_type} | ${cls.instructor} | ${cls.current_enrollment || 0}/${cls.max_capacity}`);
        });
      } else {
        console.log('⚠️  No HB classes found! They may need to be created.');
      }
    }

    // Count total HB classes
    const { count: totalCount } = await supabase
      .from('class_instances')
      .select('*', { count: 'exact', head: true })
      .like('class_type', 'HB_%');

    console.log(`\nTotal HB classes in database: ${totalCount || 0}`);

    // Check for Wednesday classes specifically
    const { data: wedClasses } = await supabase
      .from('class_instances')
      .select('class_date, class_type, start_time, end_time')
      .like('class_type', 'HB_%')
      .gte('class_date', '2025-12-24')
      .lte('class_date', '2026-01-31')
      .order('class_date');

    console.log('\n=== HB CLASSES Dec 24, 2025 - Jan 31, 2026 ===');
    if (wedClasses && wedClasses.length > 0) {
      wedClasses.forEach(cls => {
        const date = new Date(cls.class_date);
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
        console.log(`  ${dayName} ${cls.class_date} ${cls.start_time}-${cls.end_time} | ${cls.class_type}`);
      });
    } else {
      console.log('  No classes found in this range');
    }

    // Also check all classes to see what we have
    const { data: allClasses, error: allError } = await supabase
      .from('class_instances')
      .select('class_type, class_date')
      .order('class_date', { ascending: true })
      .limit(30);

    console.log('\n=== RECENT CLASSES (First 30) ===');
    if (allClasses) {
      allClasses.forEach(cls => {
        const isHB = cls.class_type?.startsWith('HB_') ? ' [HB]' : '';
        console.log(`${cls.class_date}: ${cls.class_type}${isHB}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkHBClasses();
