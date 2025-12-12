require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function debugCourseGrouping() {
  // Get all Thursday 7PM Joyce Lim wheelthrowing classes
  const { data: allClasses } = await supabase
    .from('class_instances')
    .select('*')
    .eq('start_time', '7:00 PM')
    .eq('instructor', 'Joyce Lim')
    .ilike('class_type', '%wheelthrowing%')
    .order('class_date', { ascending: true });

  console.log('All Thursday 7PM Joyce Lim classes:');
  for (const cls of allClasses) {
    const date = new Date(cls.class_date);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    console.log('  ' + cls.class_date + ' (' + dayNames[date.getDay()] + ')');
  }

  // Simulate the grouping logic
  console.log('\nGrouping into courses:');
  
  let currentCourse = [];
  let lastDate = null;
  let courseNum = 1;

  for (let i = 0; i < allClasses.length; i++) {
    const cls = allClasses[i];
    const clsDate = new Date(cls.class_date);

    if (!lastDate || (clsDate - lastDate) / (1000 * 60 * 60 * 24) <= 14) {
      currentCourse.push(cls);
      lastDate = clsDate;

      if (currentCourse.length === 6) {
        const firstClass = currentCourse[0];
        const firstDate = new Date(firstClass.class_date);
        const day = firstDate.getDate();
        const month = firstDate.getMonth() + 1;
        const dateCode = day.toString().padStart(2, '0') + month.toString().padStart(2, '0');
        
        console.log('Course ' + courseNum + ': WT' + dateCode + 'NT_JL6.x');
        console.log('  Classes: ' + currentCourse.map(c => c.class_date).join(', '));
        
        currentCourse = [];
        lastDate = null;
        courseNum++;
      }
    } else {
      if (currentCourse.length > 0) {
        const firstClass = currentCourse[0];
        const firstDate = new Date(firstClass.class_date);
        const day = firstDate.getDate();
        const month = firstDate.getMonth() + 1;
        const dateCode = day.toString().padStart(2, '0') + month.toString().padStart(2, '0');
        
        console.log('Course ' + courseNum + ' (partial): WT' + dateCode + 'NT_JL6.x');
        console.log('  Classes: ' + currentCourse.map(c => c.class_date).join(', '));
        courseNum++;
      }
      currentCourse = [cls];
      lastDate = clsDate;
    }
  }

  if (currentCourse.length > 0) {
    const firstClass = currentCourse[0];
    const firstDate = new Date(firstClass.class_date);
    const day = firstDate.getDate();
    const month = firstDate.getMonth() + 1;
    const dateCode = day.toString().padStart(2, '0') + month.toString().padStart(2, '0');
    
    console.log('Course ' + courseNum + ' (remaining): WT' + dateCode + 'NT_JL6.x');
    console.log('  Classes: ' + currentCourse.map(c => c.class_date).join(', '));
  }

  process.exit(0);
}

debugCourseGrouping();
