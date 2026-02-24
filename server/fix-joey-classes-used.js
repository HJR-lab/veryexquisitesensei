require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixJoeyClassesUsed() {
  try {
    console.log('\n🔧 Fixing Joey Lee classes_used...\\n');

    const { data: joey } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'joey.lee2302@gmail.com')
      .single();

    if (!joey) {
      console.log('❌ Joey not found');
      return;
    }

    console.log('Current values:');
    console.log('  Classes allocated:', joey.classes_allocated);
    console.log('  Classes used:', joey.classes_used);
    console.log('  Classes remaining:', (joey.classes_allocated || 0) - (joey.classes_used || 0));

    // Update classes_used to 0 since all classes are in the future
    const { error: updateError } = await supabaseDb.supabase
      .from('customers')
      .update({
        classes_used: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', joey.id);

    if (updateError) {
      console.error('❌ Error updating Joey:', updateError);
    } else {
      console.log('\\n✅ Updated Joey Lee:');
      console.log('  Classes allocated: 10');
      console.log('  Classes used: 0');
      console.log('  Classes remaining: 10\\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixJoeyClassesUsed();
