const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Finding Joey Lee...\n');

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .ilike('last_name', '%lee%');

  const joeys = customers.filter(c =>
    c.first_name && c.first_name.toLowerCase().includes('joey')
  );

  console.log(`Found ${joeys.length} Joey Lee(s):`);
  joeys.forEach(c => {
    console.log(`  ID: ${c.id}, Name: ${c.first_name} ${c.last_name}, Email: ${c.email}`);
    console.log(`    Allocated: ${c.classes_allocated}, Used: ${c.classes_used}, Courses: ${c.course_purchase_count}`);
  });
}

run();
