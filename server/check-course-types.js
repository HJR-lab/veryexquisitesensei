require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkCourseTypes() {
  try {
    // Get all unique course titles
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('course_title, number_of_weeks, class_credits_allocated, package_total_courses')
      .order('created_at', { ascending: false })
      .limit(100);

    console.log('=== Course Titles Analysis ===\n');

    const uniqueTitles = {};
    enrollments.forEach(e => {
      const key = `${e.course_title}|${e.number_of_weeks}|${e.class_credits_allocated || 'N/A'}|${e.package_total_courses || 'N/A'}`;
      if (!uniqueTitles[key]) {
        uniqueTitles[key] = 0;
      }
      uniqueTitles[key]++;
    });

    Object.keys(uniqueTitles).forEach(key => {
      const [title, weeks, credits, packageCourses] = key.split('|');
      console.log(`${uniqueTitles[key]}x - "${title}"`);
      console.log(`   Weeks: ${weeks}, Credits: ${credits}, Package: ${packageCourses}\n`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkCourseTypes();
