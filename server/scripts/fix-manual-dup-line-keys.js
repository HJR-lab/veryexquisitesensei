require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabase } = require('../utils/supabaseDb');
// The real spot-2 enrollments were repaired by hand and keyed 'MANUAL-DUP', so
// the sync's (order, line_item) dedup can't see them and re-creates the spot.
// Re-key them to the per-pax id the sync actually generates.
const FIX = [
  { id: 5292, order: '6639888400542', line: '15271763345566-2' }, // Denise Lai
  { id: 5291, order: '6642725814430', line: '15276801065118-2' }, // Nigel Lim
];
(async () => {
  for (const f of FIX) {
    const { data: e } = await supabase
      .from('course_enrollments')
      .select('id, shopify_order_id, shopify_line_item_id, status, course_identifier')
      .eq('id', f.id)
      .single();
    if (!e || e.shopify_order_id !== f.order || e.shopify_line_item_id !== 'MANUAL-DUP') {
      console.log(`REFUSED enr ${f.id}:`, JSON.stringify(e));
      continue;
    }
    const { data: clash } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('shopify_order_id', f.order)
      .eq('shopify_line_item_id', f.line);
    if ((clash || []).length) {
      console.log(`REFUSED enr ${f.id}: key already taken by`, clash.map(c => c.id));
      continue;
    }
    const { error } = await supabase
      .from('course_enrollments')
      .update({ shopify_line_item_id: f.line })
      .eq('id', f.id);
    console.log(error ? `FAILED enr ${f.id}: ${error.message}` : `enr ${f.id} re-keyed MANUAL-DUP -> ${f.line}`);
  }
  const { data: after } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, status, shopify_order_id, shopify_line_item_id')
    .in('student_id', [2652, 2653]);
  console.log('\nfinal:', JSON.stringify(after, null, 1));
})();
