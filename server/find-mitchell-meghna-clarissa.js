require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function findStudents() {
  try {
    // Find Mitchell
    const { data: mitchell } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    // Find Meghna
    const { data: meghnas } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%meghna%');

    // Find Clarissa
    const { data: clarissas } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%clarissa%');

    console.log('Found students:\n');
    console.log(`Mitchell Chan (ID: ${mitchell.id}) - ${mitchell.email}`);

    if (meghnas.length > 0) {
      meghnas.forEach(m => {
        console.log(`Meghna ${m.last_name} (ID: ${m.id}) - ${m.email}`);
      });
    }

    if (clarissas.length > 0) {
      clarissas.forEach(c => {
        console.log(`Clarissa ${c.last_name} (ID: ${c.id}) - ${c.email}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

findStudents();
