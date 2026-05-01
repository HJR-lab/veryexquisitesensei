/**
 * Segment Resolver
 *
 * Resolves segment keys to arrays of customers for targeted email campaigns.
 * Each segment defines a query against the Supabase database.
 */

const { supabase } = require('./supabaseDb');

/**
 * Resolve a segment key to an array of customers.
 * @param {string} segmentKey - One of: returning, vip, lapsed_N, active, hb_students, wt_students, has_credits, members, all
 * @returns {Promise<Array<{id: number, email: string, first_name: string}>>}
 */
async function resolveSegment(segmentKey) {
  // Handle lapsed_N pattern
  const lapsedMatch = segmentKey.match(/^lapsed_(\d+)$/);
  if (lapsedMatch) {
    return resolveLapsed(parseInt(lapsedMatch[1], 10));
  }

  switch (segmentKey) {
    case 'returning':
      return resolveReturning();
    case 'vip':
      return resolveVip();
    case 'active':
      return resolveActive();
    case 'hb_students':
      return resolveByEnrollmentType('handbuilding');
    case 'wt_students':
      return resolveByEnrollmentType('wheelthrowing');
    case 'has_credits':
      return resolveHasCredits();
    case 'members':
      return resolveMembers();
    case 'all':
      return resolveAll();
    default:
      throw new Error(`Unknown segment key: ${segmentKey}`);
  }
}

/** All customers with non-null, non-empty email */
async function resolveAll() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, email, first_name')
    .not('email', 'is', null)
    .neq('email', '');

  if (error) throw error;
  return data || [];
}

/** course_purchase_count >= 2, has email */
async function resolveReturning() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, email, first_name')
    .not('email', 'is', null)
    .neq('email', '')
    .gte('course_purchase_count', 2);

  if (error) throw error;
  return data || [];
}

/** course_purchase_count >= 4, has email */
async function resolveVip() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, email, first_name')
    .not('email', 'is', null)
    .neq('email', '')
    .gte('course_purchase_count', 4);

  if (error) throw error;
  return data || [];
}

/** Has active enrollment */
async function resolveActive() {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('student_id, customers!inner(id, email, first_name)')
    .eq('status', 'active');

  if (error) throw error;

  // Deduplicate by customer id
  const seen = new Set();
  const customers = [];
  for (const row of (data || [])) {
    const c = row.customers;
    if (c && c.email && !seen.has(c.id)) {
      seen.add(c.id);
      customers.push({ id: c.id, email: c.email, first_name: c.first_name });
    }
  }
  return customers;
}

/** Active enrollment with course_type containing the given type (case-insensitive) */
async function resolveByEnrollmentType(courseTypeFragment) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('student_id, customers!inner(id, email, first_name)')
    .eq('status', 'active')
    .ilike('course_type', `%${courseTypeFragment}%`);

  if (error) throw error;

  const seen = new Set();
  const customers = [];
  for (const row of (data || [])) {
    const c = row.customers;
    if (c && c.email && !seen.has(c.id)) {
      seen.add(c.id);
      customers.push({ id: c.id, email: c.email, first_name: c.first_name });
    }
  }
  return customers;
}

/** Positive credit balance (sum earn - spend) */
async function resolveHasCredits() {
  const now = new Date().toISOString();

  // Get all non-expired earn transactions
  const { data: earnData, error: earnError } = await supabase
    .from('credit_transactions')
    .select('customer_id, amount')
    .eq('type', 'earn')
    .gt('expires_at', now);

  if (earnError) throw earnError;

  // Get all spend transactions
  const { data: spendData, error: spendError } = await supabase
    .from('credit_transactions')
    .select('customer_id, amount')
    .eq('type', 'spend');

  if (spendError) throw spendError;

  // Compute balance per customer
  const balances = {};
  for (const row of (earnData || [])) {
    balances[row.customer_id] = (balances[row.customer_id] || 0) + Number(row.amount);
  }
  for (const row of (spendData || [])) {
    balances[row.customer_id] = (balances[row.customer_id] || 0) - Number(row.amount);
  }

  // Filter to positive balances
  const customerIds = Object.entries(balances)
    .filter(([, bal]) => bal > 0)
    .map(([id]) => parseInt(id, 10));

  if (customerIds.length === 0) return [];

  const { data, error } = await supabase
    .from('customers')
    .select('id, email, first_name')
    .in('id', customerIds)
    .not('email', 'is', null)
    .neq('email', '');

  if (error) throw error;
  return data || [];
}

/** Active membership */
async function resolveMembers() {
  const { data, error } = await supabase
    .from('memberships')
    .select('customer_id, customers!inner(id, email, first_name)')
    .eq('status', 'active');

  if (error) throw error;

  const seen = new Set();
  const customers = [];
  for (const row of (data || [])) {
    const c = row.customers;
    if (c && c.email && !seen.has(c.id)) {
      seen.add(c.id);
      customers.push({ id: c.id, email: c.email, first_name: c.first_name });
    }
  }
  return customers;
}

/**
 * Lapsed customers: last booking (attended/completed) > N days ago, no active enrollment.
 * Joins bookings → class_instances to get class_date.
 */
async function resolveLapsed(days) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  // Get customers with active enrollments (to exclude them)
  const { data: activeEnrollments, error: activeError } = await supabase
    .from('course_enrollments')
    .select('student_id')
    .eq('status', 'active');

  if (activeError) throw activeError;

  const activeStudentIds = new Set((activeEnrollments || []).map(e => e.student_id));

  // Get all bookings with attended/completed status, joined with class_instances for class_date
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('student_id, class_instances!bookings_class_instance_id_fkey(class_date)')
    .in('status', ['attended', 'completed']);

  if (bookingsError) throw bookingsError;

  // Find each customer's most recent class_date
  const latestByStudent = {};
  for (const b of (bookings || [])) {
    const classDate = b.class_instances?.class_date?.split(/[T ]/)[0];
    if (!classDate) continue;
    if (!latestByStudent[b.student_id] || classDate > latestByStudent[b.student_id]) {
      latestByStudent[b.student_id] = classDate;
    }
  }

  // Filter: last class_date < cutoff AND not in active enrollments
  const lapsedIds = Object.entries(latestByStudent)
    .filter(([studentId, lastDate]) => lastDate < cutoffStr && !activeStudentIds.has(parseInt(studentId, 10)))
    .map(([id]) => parseInt(id, 10));

  if (lapsedIds.length === 0) return [];

  const { data, error } = await supabase
    .from('customers')
    .select('id, email, first_name')
    .in('id', lapsedIds)
    .not('email', 'is', null)
    .neq('email', '');

  if (error) throw error;
  return data || [];
}

module.exports = { resolveSegment };
