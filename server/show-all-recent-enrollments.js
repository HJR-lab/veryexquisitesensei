require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .gte('created_at', '2025-11-01')
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-01-31')
    .order('shopify_order_id', { ascending: true });

  console.log('ALL RECENT WHEELTHROWING ENROLLMENTS FOR JANUARY 2026:\n');

  const orders = {};
  data.forEach(e => {
    const orderId = e.shopify_order_id || 'NO ORDER';
    if (!orders[orderId]) orders[orderId] = [];
    orders[orderId].push(e);
  });

  Object.keys(orders).sort().forEach(orderId => {
    const enrolls = orders[orderId];
    console.log('Order ' + orderId + ': ' + enrolls.length + ' enrollments');
    enrolls.forEach(e => {
      console.log('  Student ' + e.student_id + ': ' + e.schedule_pattern + ' ' + (e.class_time || 'NO TIME') + ' - ' + e.course_start_date);
    });
    console.log();
  });

  console.log('Total enrollments:', data.length);
  console.log('Unique orders:', Object.keys(orders).length);

  process.exit(0);
})();
