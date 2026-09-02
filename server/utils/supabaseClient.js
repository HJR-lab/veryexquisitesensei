/**
 * Shared Supabase client.
 *
 * Single service-role client instance used by all *Db data-access modules
 * (supabaseDb.js, notificationDb.js, ...). Extracted so domain modules can be
 * split out of the monolithic supabaseDb.js without each creating its own
 * client connection.
 */

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Read EVERY row a query matches, not just the first page.
 *
 * PostgREST caps a response at 1000 rows and says nothing about it — no error,
 * no flag, just a short array. A count built from a truncated page is silently
 * too low, which is how a class with 10 people booked into 10 seats came to
 * advertise "7 left" on the student booking page.
 *
 * Pass a function that builds the query fresh each call; it is re-run per page
 * with a different .range(), so it must not be an already-built query.
 *
 * @param {(from: number, to: number) => PromiseLike<{data: any[], error: any}>} page
 * @returns {Promise<any[]>} every matching row
 */
async function fetchAllRows(page) {
  const PAGE_SIZE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

module.exports = { supabase, fetchAllRows };
