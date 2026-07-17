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

module.exports = { supabase };
