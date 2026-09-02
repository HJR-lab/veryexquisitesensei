/**
 * Read-only. Verifies the shopify_customer_id fallback in processCoursePurchase:
 * it must rescue a customer whose email is locked away from Shopify's (Ryan Ling),
 * and must REFUSE to cross people when the ID belongs to a purchaser who bought on
 * someone else's behalf (Kirsty Gascoin's ID → Kevin House's row).
 */
require('dotenv').config();
const { supabase, findCustomerByEmail, findCustomerByShopifyId } = require('../utils/supabaseDb');
const { samePerson } = require('../utils/courseEnrollmentManager');

let failed = 0;
function check(label, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`  ${ok ? '✅' : '❌'} ${label} — got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  if (!ok) failed++;
}

// Mirrors the resolution order in processCoursePurchase.
async function resolve({ email, shopifyCustomerId, first_name, last_name, isExtraPax = false }) {
  const byEmail = await findCustomerByEmail(email);
  if (byEmail) return { id: byEmail.id, via: 'email' };
  if (!shopifyCustomerId || isExtraPax) return { id: null, via: 'none' };
  const candidate = await findCustomerByShopifyId(shopifyCustomerId);
  if (!candidate) return { id: null, via: 'none' };
  return samePerson(candidate, { first_name, last_name })
    ? { id: candidate.id, via: 'shopify_id' }
    : { id: null, via: 'refused' };
}

(async () => {
  console.log('\nCHECK 1 — name matching');
  check('same name, different case', samePerson({ first_name: 'RYAN', last_name: 'LING' }, { first_name: 'Ryan', last_name: 'Ling' }), true);
  check('two different people', samePerson({ first_name: 'Kevin', last_name: 'House' }, { first_name: 'kirsty', last_name: 'gascoin' }), false);
  check('reordered name parts', samePerson({ first_name: 'Min Yi', last_name: 'Tay' }, { first_name: 'Tay', last_name: 'Min Yi' }), true);
  check('added middle name', samePerson({ first_name: 'Ryan', last_name: 'Ling' }, { first_name: 'Ryan Wei', last_name: 'Ling' }), true);
  check('a gift between family sharing a surname', samePerson({ first_name: 'Kevin', last_name: 'House' }, { first_name: 'Kirsty', last_name: 'House' }), false);
  check('missing name is not a mismatch', samePerson({ first_name: null, last_name: null }, { first_name: 'Ryan', last_name: 'Ling' }), true);

  console.log('\nCHECK 2 — Ryan Ling is rescued by the fallback');
  const ryan = await resolve({ email: 'ryan.ling@u.nus.edu', shopifyCustomerId: '8995355558046', first_name: 'RYAN', last_name: 'LING' });
  check('email alone finds nobody', (await findCustomerByEmail('ryan.ling@u.nus.edu')) === null, true);
  check('resolves to customer 2231 via shopify id', ryan, { id: 2231, via: 'shopify_id' });

  console.log('\nCHECK 3 — a purchase made on someone else\'s behalf cannot cross people');
  const kirsty = await resolve({ email: 'sealessfishes@gmail.com', shopifyCustomerId: '9339381907614', first_name: 'kirsty', last_name: 'gascoin' });
  check('Kirsty\'s order is refused, not filed as Kevin', kirsty, { id: null, via: 'refused' });
  const kevin = await resolve({ email: 'kelhouse@gmail.com', shopifyCustomerId: '9339381907614', first_name: 'Kevin', last_name: 'House' });
  check('Kevin\'s own order still resolves by email', kevin, { id: 2865, via: 'email' });

  console.log('\nCHECK 4 — extra-pax spots never use the fallback');
  const pax = await resolve({ email: 'ryan.ling+dup@u.nus.edu', shopifyCustomerId: '8995355558046', first_name: 'RYAN', last_name: 'LING', isExtraPax: true });
  check('an unknown +dup email does not collapse onto the purchaser', pax, { id: null, via: 'none' });

  console.log('\nCHECK 5 — Ryan\'s Sept 8 enrollment is in place, exactly once');
  const { data: enr } = await supabase.from('course_enrollments').select('id,student_id,course_identifier,status').eq('shopify_order_id', '6877357670558');
  check('one enrollment for order #2719', enr.length, 1);
  check('on Ryan, in the Tuesday cohort', { s: enr[0]?.student_id, c: enr[0]?.course_identifier }, { s: 2231, c: 'WT0809NT_JL6' });
  const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('course_enrollment_id', enr[0]?.id);
  check('six Tuesdays booked', count, 6);

  console.log(failed === 0 ? '\nAll checks passed.\n' : `\n${failed} check(s) failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
