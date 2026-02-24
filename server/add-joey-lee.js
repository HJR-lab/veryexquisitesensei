require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function addJoeyLee() {
  try {
    console.log('\n🔍 Checking for Joey Lee...\n');

    // Check if customer already exists
    const { data: existing } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'joey.lee2302@gmail.com')
      .single();

    if (existing) {
      console.log('✅ Customer already exists:', existing.first_name, existing.last_name);
      console.log('   Email:', existing.email);
      console.log('   DB ID:', existing.id);
      return;
    }

    console.log('➕ Creating new customer: Joey Lee\n');

    // Create customer with Wheelthrowing Beginner enrollment (10 classes, no expiry)
    // Generate unique Shopify ID based on timestamp
    const uniqueShopifyId = '8' + Date.now().toString().slice(-12);

    const { data: customer, error: custError} = await supabaseDb.supabase
      .from('customers')
      .insert({
        shopify_customer_id: uniqueShopifyId,
        email: 'joey.lee2302@gmail.com',
        first_name: 'Joey',
        last_name: 'Lee',
        customer_type: 'student',
        course_purchase_date: new Date('2026-01-10T14:19:26+08:00').toISOString(),
        course_expiry_date: null, // NO EXPIRY
        classes_allocated: 10,
        classes_used: 0,
        classes_forfeited: 0,
        course_purchase_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString()
      })
      .select()
      .single();

    if (custError) {
      console.error('❌ Error creating customer:', custError);
      return;
    }

    console.log('✅ Customer created successfully!');
    console.log('   Name:', customer.first_name, customer.last_name);
    console.log('   Email:', customer.email);
    console.log('   DB ID:', customer.id);
    console.log('   Course: Wheelthrowing Beginner');
    console.log('   Classes allocated:', customer.classes_allocated);
    console.log('   Expiry:', customer.course_expiry_date || 'NO EXPIRY');

    console.log('\n✨ Joey Lee is ready to be enrolled in classes!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addJoeyLee();
