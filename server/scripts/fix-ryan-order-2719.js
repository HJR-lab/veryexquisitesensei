/**
 * One-off: place Ryan Ling's order #2719 (WT0809NT_JL6, Tue 8 Sep) which the
 * order sync silently dropped because his local row's email is email_locked to
 * ryan.ry.ling@gmail.com while the order was placed under the Shopify customer
 * carrying ryan.ling@u.nus.edu.
 *
 * Runs the REAL sync code path (processCoursePurchase) so it exercises the new
 * shopify_customer_id fallback rather than hand-writing the enrollment.
 *
 * Usage: node scripts/fix-ryan-order-2719.js [--apply]
 */
require('dotenv').config();
const https = require('https');
const { supabase } = require('../utils/supabaseDb');

const APPLY = process.argv.includes('--apply');
const ORDER_GID = 'gid://shopify/Order/6877357670558';

function gql(query) {
  const p = JSON.stringify({ query });
  return new Promise((res, rej) => {
    const r = https.request({ host: process.env.SHOPIFY_SHOP_DOMAIN, path: '/admin/api/2025-01/graphql.json', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'identity', 'Connection': 'close',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN, 'Content-Length': Buffer.byteLength(p) } },
      (resp) => { let raw = ''; resp.setEncoding('utf8'); resp.on('data', c => raw += c); resp.on('end', () => {
        const j = JSON.parse(raw); if (j.errors) return rej(new Error(JSON.stringify(j.errors).slice(0, 300))); res(j.data); }); });
    r.on('error', rej); r.write(p); r.end();
  });
}

(async () => {
  const d = await gql(`query{order(id:"${ORDER_GID}"){id name createdAt displayFinancialStatus
    customer{id email firstName lastName}
    lineItems(first:10){edges{node{id title variantTitle quantity}}}}}`);
  const o = d.order;
  console.log(`Order ${o.name} ${o.createdAt} ${o.displayFinancialStatus}`);
  console.log(`Shopify customer ${o.customer.id} <${o.customer.email}>`);

  const item = o.lineItems.edges.map(e => e.node)
    .find(li => /wheelthrowing|handbuilding|pottery course/i.test(li.title));
  if (!item) throw new Error('No course line item on this order');
  console.log(`Line item: x${item.quantity} "${item.title}" | "${item.variantTitle}"`);
  if (item.quantity !== 1) throw new Error(`Expected quantity 1, got ${item.quantity} — use the pax path instead`);

  // Built exactly as orderSyncPass builds it
  const order = {
    id: o.id.split('/').pop(),
    createdAt: o.createdAt,
    customer: {
      email: o.customer.email,
      shopifyCustomerId: o.customer.id.split('/').pop(),
      isExtraPax: false,
      first_name: o.customer.firstName,
      last_name: o.customer.lastName,
    },
  };
  const lineItem = { id: item.id.split('/').pop(), title: item.title, variantTitle: item.variantTitle };

  if (!APPLY) {
    const { findCustomerByEmail, findCustomerByShopifyId } = require('../utils/supabaseDb');
    console.log('\n--- DRY RUN (pass --apply to write) ---');
    console.log('by email :', (await findCustomerByEmail(order.customer.email))?.id ?? 'NULL');
    const viaId = await findCustomerByShopifyId(order.customer.shopifyCustomerId);
    console.log('by shopify id:', viaId ? `${viaId.id} (${viaId.email})` : 'NULL');
    return;
  }

  const { processCoursePurchase } = require('../utils/courseEnrollmentManager');
  const result = await processCoursePurchase(order, lineItem);
  console.log('\nresult:', JSON.stringify(result, null, 1));

  if (result.success && !result.skipped) {
    const { data: enr } = await supabase.from('course_enrollments').select('*')
      .eq('shopify_order_id', order.id).eq('shopify_line_item_id', lineItem.id).single();
    console.log(`\nEnrollment ${enr.id}: student=${enr.student_id} ident=${enr.course_identifier} status=${enr.status} start=${enr.course_start_date} weeks=${enr.number_of_weeks} alloc=${enr.class_credits_allocated}`);
    const { data: bk } = await supabase.from('bookings').select('id,class_instance_id,status,booking_type').eq('course_enrollment_id', enr.id);
    console.log(`Bookings: ${bk.length}`);
    for (const b of bk) {
      const { data: ci } = await supabase.from('class_instances').select('class_date,start_time,class_type').eq('id', b.class_instance_id).maybeSingle();
      console.log(`  ${b.id} ${b.status}/${b.booking_type} -> ${String(ci?.class_date).slice(0,10)} ${ci?.start_time} ${ci?.class_type}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
