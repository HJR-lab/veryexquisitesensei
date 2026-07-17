/**
 * Supabase Database Adapter
 *
 * Bypasses Prisma connection issues by using direct Supabase SQL queries
 */


// This module is now a thin compatibility barrel. Every data-access function
// lives in a focused domain module; they are merged below so existing
// `require('./supabaseDb').<fn>` and `supabaseDb.supabase` call sites keep
// working unchanged after the incremental split.
const { supabase } = require('./supabaseClient');
const customerDb = require('./customerDb');
const piecesDb = require('./piecesDb');
const bookingDb = require('./bookingDb');
const membershipDb = require('./membershipDb');
const enrollmentDb = require('./enrollmentDb');
const notificationDb = require('./notificationDb');

module.exports = {
  supabase,
  ...customerDb,
  ...piecesDb,
  ...bookingDb,
  ...membershipDb,
  ...enrollmentDb,
  ...notificationDb,
};
