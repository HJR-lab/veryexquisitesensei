const express = require('express');
const { syncCustomer } = require('../utils/shopifySync');
const supabaseDb = require('../utils/supabaseDb');
const { sendAndLogEmail } = require('../utils/emailService');
const courseConfig = require('../utils/courseConfig');

const { generateKidsOutreachEmail } = require('../email-templates/kids-outreach');
const { generateMembershipConfirmedEmail } = require('../email-templates/membership-confirmed');
const { generateVoucherOutreachEmail } = require('../email-templates/voucher-outreach');
const { readMembershipSettings } = require('../utils/membershipSettings');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler, getShopifyClient, shopify }) {

// ============================================
// SHOPIFY INTEGRATION ENDPOINTS
// ============================================

// Resilient Shopify GraphQL call used by the sync endpoints.
//
// The Shopify SDK's node-fetch client began failing on Railway with
// "Premature close" (ERR_STREAM_PREMATURE_CLOSE at Gunzip): the gzip response
// stream is truncated mid-body on every call, breaking sync. This bypasses the
// SDK's fetch entirely and talks to Shopify over a raw HTTPS request we fully
// control: no gzip (so there is no gunzip stream to truncate), no keep-alive
// reuse (Connection: close → a fresh socket every time), and automatic retry
// with backoff. Returns { body: <parsed JSON> } to match the SDK's shape.
const SHOPIFY_API_VERSION = '2024-04';
function shopifyGraphQL(query, variables = {}) {
  const https = require('https');
  const payload = JSON.stringify({ query, variables });
  const attempt = () => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const req = https.request({
      host: process.env.SHOPIFY_SHOP_DOMAIN,
      path: `/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity', // no gzip — avoids the truncated-gunzip failure
        'Connection': 'close',         // fresh socket each call — avoids poisoned keep-alive
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Shopify HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
        }
        try {
          const parsed = JSON.parse(raw);
          if (parsed.errors) return reject(new Error(`Shopify GraphQL errors: ${JSON.stringify(parsed.errors).slice(0, 300)}`));
          resolve({ body: parsed });
        } catch (e) {
          reject(new Error(`Shopify JSON parse failed (${raw.length} bytes, ${Date.now() - t0}ms): ${e.message}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Shopify request timed out after 30s')); });
    req.write(payload);
    req.end();
  });

  return (async () => {
    let lastErr;
    for (let i = 1; i <= 3; i++) {
      try {
        return await attempt(i);
      } catch (err) {
        lastErr = err;
        console.warn(`⚠️  Shopify GraphQL attempt ${i}/3 failed: ${err.message}`);
        if (i < 3) await new Promise((r) => setTimeout(r, 500 * i));
      }
    }
    throw lastErr;
  })();
}

// Auto-complete enrollments where all booked class dates have passed
async function autoCompleteFinishedEnrollments() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Get all active enrollments (include credit + package fields)
    const { data: activeEnrollments, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, student_id, course_identifier, course_type, number_of_weeks, total_weeks, class_credits_allocated, class_credits_remaining')
      .in('status', ['active']);

    if (error || !activeEnrollments?.length) return 0;

    let completedCount = 0;

    for (const enrollment of activeEnrollments) {
      // Get all bookings for this enrollment
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
        .eq('course_enrollment_id', enrollment.id)
        .in('status', ['booked', 'completed', 'attended']);

      if (!bookings || bookings.length === 0) continue;

      // Check if ALL booking dates are in the past (use regex to handle both "T" and space separators)
      const allPast = bookings.every(b => {
        const d = b.class_instances?.class_date?.split(/[T ]/)[0];
        return d && d < todayStr;
      });

      if (allPast) {
        // Compute credits from actual bookings (never trust stale DB columns)
        const credits = await supabaseDb.getEnrollmentCredits(enrollment.id);

        // Skip HB credit-based enrollments that still have remaining credits
        const isHB = enrollment.course_type && enrollment.course_type.toLowerCase().includes('handbuilding');
        if (isHB && credits.remaining > 0) {
          continue; // Student still has credits to use
        }

        // 10-class packages (number_of_weeks=10, total_weeks=6): allocate 4 flex credits
        // when WT course completes, instead of marking as completed
        const is10ClassPackage = enrollment.number_of_weeks === 10 && (enrollment.total_weeks === 6 || bookings.length === 6);
        if (is10ClassPackage && !enrollment.class_credits_allocated) {
          const flexCredits = enrollment.number_of_weeks - (enrollment.total_weeks || 6);
          await supabaseDb.supabase
            .from('course_enrollments')
            .update({
              class_credits_allocated: flexCredits,
              updated_at: new Date().toISOString()
            })
            .eq('id', enrollment.id);
          console.log(`Allocated ${flexCredits} flex credits for 10-class package enrollment ${enrollment.id} (${enrollment.course_identifier})`);
          continue; // Don't complete yet — student has flex credits to use
        }

        // Skip if enrollment still has flex credits remaining
        if (credits.remaining > 0) {
          continue;
        }

        await supabaseDb.supabase
          .from('course_enrollments')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        console.log(`Auto-completed enrollment ${enrollment.id} (${enrollment.course_identifier}) — all classes past`);
        completedCount++;
      }
    }

    if (completedCount > 0) {
      console.log(`Auto-completed ${completedCount} finished enrollments`);
    }
    return completedCount;
  } catch (error) {
    console.error('Error auto-completing enrollments:', error);
    return 0;
  }
}

// Sync all customers from Shopify
app.post('/api/admin/sync-shopify-customers', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  console.log('🔄 Starting Shopify customer sync...');

  let syncedCount = 0;
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    let query, variables;

    if (cursor) {
      query = `
        query getCustomers($cursor: String!) {
          customers(first: 250, after: $cursor) {
            edges {
              node {
                id
                email
                firstName
                lastName
                createdAt
                tags
                orders(first: 10) {
                  edges {
                    node {
                      id
                      createdAt
                      lineItems(first: 10) {
                        edges {
                          node {
                            title
                            variantTitle
                            quantity
                          }
                        }
                      }
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;
      variables = { cursor };
    } else {
      query = `
        query getCustomers {
          customers(first: 250) {
            edges {
              node {
                id
                email
                firstName
                lastName
                createdAt
                tags
                orders(first: 10) {
                  edges {
                    node {
                      id
                      createdAt
                      lineItems(first: 10) {
                        edges {
                          node {
                            title
                            variantTitle
                            quantity
                          }
                        }
                      }
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;
      variables = {};
    }

    const response = await shopifyGraphQL(query, variables);
    const customersData = response.body.data.customers;

    for (const edge of customersData.edges) {
      const customer = edge.node;
      const customerId = customer.id.split('/').pop();

      // Filter: Only sync customers who have purchased courses/workshops/classes
      // Also extract class dates from variantTitle
      let earliestClassStart = null;
      let latestClassEnd = null;
      let hasPurchasedCourse = false;
      let coursePurchaseCount = 0;

      // Process all orders to find courses and extract dates
      customer.orders.edges.forEach(orderEdge => {
        // Use order creation date to determine the year for class dates
        const orderCreatedAt = new Date(orderEdge.node.createdAt);
        const orderYear = orderCreatedAt.getFullYear();

        // Track if this order contains a course
        let orderHasCourse = false;

        orderEdge.node.lineItems.edges.forEach(lineItemEdge => {
          const title = lineItemEdge.node.title.toLowerCase();
          const variantTitle = lineItemEdge.node.variantTitle;

          const isCourse = title.includes('course') ||
                 title.includes('workshop') ||
                 title.includes('class') ||
                 title.includes('pottery') ||
                 title.includes('wheel') ||
                 title.includes('handbuilding');

          if (isCourse) {
            hasPurchasedCourse = true;
            orderHasCourse = true;

            if (variantTitle) {
              // Parse dates from variantTitle like "TUESDAYS 21 October –25 November (7:00pm-9:30pm)"
              const dateMatch = variantTitle.match(/(\d{1,2})\s+(\w+)(?:\s*[–-]\s*(\d{1,2})\s+(\w+))?/);

              if (dateMatch) {
                const monthMap = {
                  'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
                  'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5,
                  'july': 6, 'jul': 6, 'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
                  'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
                };

                const startDay = parseInt(dateMatch[1]);
                const startMonthStr = dateMatch[2].toLowerCase();
                const startMonth = monthMap[startMonthStr];

                if (startMonth !== undefined) {
                  // Use order year, or next year if class starts before order was placed
                  const orderMonth = orderCreatedAt.getMonth();
                  let classYear = orderYear;
                  // If class month is before order month, class is likely in the next year
                  if (startMonth < orderMonth - 1) {
                    classYear = orderYear + 1;
                  }

                  const startDate = new Date(classYear, startMonth, startDay);

                  if (!earliestClassStart || startDate < earliestClassStart) {
                    earliestClassStart = startDate;
                  }

                  // Check for end date
                  if (dateMatch[3] && dateMatch[4]) {
                    const endDay = parseInt(dateMatch[3]);
                    const endMonthStr = dateMatch[4].toLowerCase();
                    const endMonth = monthMap[endMonthStr];

                    if (endMonth !== undefined) {
                      let endDate = new Date(classYear, endMonth, endDay);

                      // Handle year wrap (if end month is before start month, add a year)
                      if (endDate < startDate) {
                        endDate.setFullYear(classYear + 1);
                      }

                      if (!latestClassEnd || endDate > latestClassEnd) {
                        latestClassEnd = endDate;
                      }
                    }
                  } else {
                    // If no end date, assume same as start
                    if (!latestClassEnd || startDate > latestClassEnd) {
                      latestClassEnd = startDate;
                    }
                  }
                }
              }
            }
          }
        });

        // Count this order as a course purchase if it contains a course
        if (orderHasCourse) {
          coursePurchaseCount++;
        }
      });

      if (!hasPurchasedCourse) {
        console.log(`⏭️  Skipping customer ${customer.email || customerId} - no course purchases`);
        continue;
      }

      try {
        // Pass class dates from Shopify orders and course purchase count
        if (earliestClassStart || latestClassEnd) {
          console.log(`📅 ${customer.email}: ${earliestClassStart?.toISOString().split('T')[0]} to ${latestClassEnd?.toISOString().split('T')[0]} (${coursePurchaseCount} courses)`);
        }
        await syncCustomer(customer, customerId, earliestClassStart, latestClassEnd, coursePurchaseCount);
        syncedCount++;
      } catch (error) {
        console.error(`Failed to sync customer ${customer.email}:`, error);
      }
    }

    hasNextPage = customersData.pageInfo.hasNextPage;
    if (hasNextPage && customersData.edges.length > 0) {
      cursor = customersData.edges[customersData.edges.length - 1].cursor;
    }
  }

  console.log(`✅ Synced ${syncedCount} customers from Shopify`);

  // Auto-complete enrollments where all booked classes have passed
  const autoCompleted = await autoCompleteFinishedEnrollments();

  // Sync customer_type based on active memberships
  await supabaseDb.syncCustomerTypeFromMemberships();

  res.json({
    success: true,
    message: `Synced ${syncedCount} customers from Shopify` + (autoCompleted > 0 ? `, auto-completed ${autoCompleted} finished enrollments` : ''),
    count: syncedCount
  });

}));

// Backfill HB enrollment credits (fix enrollments where credits were not saved)
app.post('/api/admin/backfill-hb-credits', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  console.log('🔧 Backfilling HB enrollment credits...');

  // Find all HB enrollments with NULL or 0 credits
  const { data: hbEnrollments, error } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .ilike('course_type', '%handbuilding%')
    .or('class_credits_allocated.is.null,class_credits_allocated.eq.0');

  if (error) throw error;

  if (!hbEnrollments || hbEnrollments.length === 0) {
    return res.json({ success: true, message: 'No HB enrollments need backfilling', fixed: 0 });
  }

  let fixedCount = 0;
  for (const enrollment of hbEnrollments) {
    // Determine credits based on number_of_weeks
    const credits = enrollment.number_of_weeks || 4;

    // Allocation is the one figure the ledger cannot derive, so it is set here;
    // used/remaining are then recomputed from the bookings by syncStoredCredits.
    //
    // This used to count ['booked','attended','completed'] itself, which quietly
    // contradicted the ledger by omitting forfeited and absent — running the
    // backfill would have handed every no-show its class back, undoing the
    // policy that a no-show burns it.
    const { error: updateError } = await supabaseDb.supabase
      .from('course_enrollments')
      .update({
        class_credits_allocated: credits,
        glazing_class_used: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollment.id);

    const synced = await supabaseDb.syncStoredCredits(enrollment.id);
    const used = synced ? synced.committed : 0;
    const remaining = synced ? synced.remaining : 0;

    if (updateError) {
      console.error(`⚠️  Failed to update enrollment ${enrollment.id}:`, updateError);
    } else {
      fixedCount++;
      console.log(`✅ Fixed enrollment ${enrollment.id}: ${credits} credits allocated, ${used} used, ${remaining} remaining`);
    }
  }

  console.log(`🔧 Backfill complete: fixed ${fixedCount}/${hbEnrollments.length} HB enrollments`);

  res.json({
    success: true,
    message: `Fixed ${fixedCount} HB enrollments with missing credits`,
    fixed: fixedCount,
    total: hbEnrollments.length
  });

}));

// Admin: Mark HB class as completed — credits are computed from bookings
app.post('/api/admin/hb-enrollments/:enrollmentId/mark-class-done', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;

  // Credits are computed on read — just return current state
  const credits = await supabaseDb.getEnrollmentCredits(parseInt(enrollmentId, 10));

  console.log(`✅ HB enrollment ${enrollmentId}: ${credits.attended} attended, ${credits.booked} booked, ${credits.remaining} remaining`);

  res.json({
    success: true,
    creditsUsed: credits.attended,
    creditsRemaining: credits.remaining,
    creditsAllocated: credits.allocated
  });

}));

// Admin: Set HB enrollment credits directly (for corrections)
app.post('/api/admin/hb-enrollments/:enrollmentId/set-credits', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  const { allocated, used } = req.body;

  if (allocated === undefined || used === undefined) {
    return res.status(400).json({ error: 'allocated and used are required' });
  }

  // Sanity-check the numbers so a typo can't silently corrupt an enrollment
  // (this endpoint writes credit columns directly from the request body).
  const allocatedNum = Number(allocated);
  const usedNum = Number(used);
  if (!Number.isInteger(allocatedNum) || !Number.isInteger(usedNum)) {
    return res.status(400).json({ error: 'allocated and used must be integers' });
  }
  if (allocatedNum < 0 || usedNum < 0) {
    return res.status(400).json({ error: 'allocated and used must be non-negative' });
  }
  if (allocatedNum > 50) {
    return res.status(400).json({ error: 'allocated exceeds sane maximum (50) — check the value' });
  }
  if (usedNum > allocatedNum) {
    return res.status(400).json({ error: `used (${usedNum}) cannot exceed allocated (${allocatedNum})` });
  }

  // DELIBERATE OVERRIDE, and the last remaining way for the stored counter to
  // diverge from the bookings ledger. It stays because the admin Users list
  // drives four workflows off it, including "mark this block fully used".
  // scripts/verify-credit-columns.js will report any enrollment left disagreeing
  // with the ledger after it is used. Longer term the "fully used" case is what
  // credits_closed_at is for — see kanban t_0ff993e9.
  const remaining = Math.max(allocatedNum - usedNum, 0);

  const { data: updated, error } = await supabaseDb.supabase
    .from('course_enrollments')
    .update({
      class_credits_allocated: allocatedNum,
      class_credits_used: usedNum,
      class_credits_remaining: remaining,
      updated_at: new Date().toISOString()
    })
    .eq('id', enrollmentId)
    .select()
    .single();

  if (error) throw error;

  console.log(`✅ HB enrollment ${enrollmentId}: credits set to ${allocatedNum} allocated, ${usedNum} used, ${remaining} remaining`);

  res.json({
    success: true,
    creditsUsed: usedNum,
    creditsRemaining: remaining,
    creditsAllocated: allocatedNum
  });

}));

// Admin: Set HB enrollment status (cancel, complete, etc.)
app.post('/api/admin/hb-enrollments/:enrollmentId/set-status', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  const { status } = req.body;

  if (!['active', 'completed', 'cancelled', 'paused'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { data, error } = await supabaseDb.supabase
    .from('course_enrollments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', enrollmentId)
    .select()
    .single();

  if (error) throw error;

  // When cancelling, delete associated class instances from Google Calendar
  if (status === 'cancelled' && data.course_identifier) {
    try {
      const calendarSync = require('../utils/calendarSync');
      const { data: classInstances } = await supabaseDb.supabase
        .from('class_instances')
        .select('id, google_calendar_event_id')
        .like('class_type', `${data.course_identifier}.%`);
      for (const ci of (classInstances || [])) {
        if (ci.google_calendar_event_id) {
          calendarSync.deleteClassInstance(ci.id).catch(() => {});
        }
      }
    } catch (e) { /* ignore */ }

    // Also cancel any booked bookings for this enrollment
    await supabaseDb.supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('course_enrollment_id', parseInt(enrollmentId))
      .eq('status', 'booked');
  }

  console.log(`✅ HB enrollment ${enrollmentId}: status set to ${status}`);
  res.json({ success: true, status });
}));

// Admin: Book HB class(es) for a student using their enrollment credits
app.post('/api/admin/hb-enrollments/:enrollmentId/book-classes', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  const { classInstanceIds } = req.body; // Array of class instance IDs to book

  if (!classInstanceIds || !Array.isArray(classInstanceIds) || classInstanceIds.length === 0) {
    return res.status(400).json({ error: 'classInstanceIds array is required' });
  }

  // Get enrollment
  const { data: enrollment, error: enrollError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', enrollmentId)
    .single();

  if (enrollError || !enrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  if (enrollment.status !== 'active') {
    return res.status(400).json({ error: 'Enrollment is not active' });
  }

  const studentId = enrollment.student_id;

  // Enforce credit limit: count existing bookings for this enrollment
  const { count: existingBookingCount } = await supabaseDb.supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('course_enrollment_id', parseInt(enrollmentId))
    .in('status', ['booked', 'attended']);

  const maxCredits = enrollment.class_credits_allocated || enrollment.number_of_weeks || 4;
  const currentBookings = existingBookingCount || 0;

  // Check for existing bookings to avoid duplicates
  const { data: existingBookings } = await supabaseDb.supabase
    .from('bookings')
    .select('class_instance_id')
    .eq('student_id', studentId)
    .in('class_instance_id', classInstanceIds)
    .in('status', ['booked', 'attended']);

  const alreadyBooked = new Set((existingBookings || []).map(b => b.class_instance_id));

  // Calculate how many new bookings we can actually create
  const newClassIds = classInstanceIds.filter(id => !alreadyBooked.has(id));
  const slotsAvailable = maxCredits - currentBookings;

  if (slotsAvailable <= 0) {
    return res.status(400).json({
      error: `No credits remaining. This enrollment has ${maxCredits} credits and ${currentBookings} bookings already.`
    });
  }

  if (newClassIds.length > slotsAvailable) {
    return res.status(400).json({
      error: `Only ${slotsAvailable} credits remaining (${maxCredits} total, ${currentBookings} used). Cannot book ${newClassIds.length} classes.`
    });
  }

  // Book each class
  const newBookings = [];
  for (const classId of classInstanceIds) {
    if (alreadyBooked.has(classId)) continue;

    const { data: booking, error: bookErr } = await supabaseDb.supabase
      .from('bookings')
      .insert({
        student_id: studentId,
        class_instance_id: classId,
        status: 'booked',
        course_enrollment_id: parseInt(enrollmentId),
        booking_type: 'regular',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (!bookErr && booking) {
      newBookings.push(booking);
      await supabaseDb.updateClassEnrollment(classId, 1);
    }
  }

  // Update enrollment booking timestamp only — credits are computed on read
  await supabaseDb.supabase
    .from('course_enrollments')
    .update({
      bookings_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', enrollmentId);

  console.log(`✅ Admin booked ${newBookings.length} HB classes for enrollment ${enrollmentId} (student ${studentId})`);

  res.json({
    success: true,
    message: `Booked ${newBookings.length} classes`,
    bookingsCreated: newBookings.length,
    alreadyBooked: alreadyBooked.size
  });

}));

// Sync recent orders and create enrollments/bookings
app.post('/api/admin/sync-shopify-orders', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { sinceDate } = req.body || {};
  console.log('🔄 Starting Shopify order sync...');
  const { processCoursePurchase } = require('../utils/courseEnrollmentManager');
  const { supabase } = require('../utils/supabaseDb');

  let processedCount = 0;
  let enrollmentsCreated = 0;
  let skippedCount = 0;
  let hasNextPage = true;
  let cursor = null;

  // Use sinceDate from request body if provided (for deep re-sync)
  let lastSyncAt;
  if (sinceDate) {
    lastSyncAt = new Date(sinceDate);
    console.log(`📅 Deep re-sync from: ${lastSyncAt.toISOString()}`);
  } else {
    try {
      const { data: syncData, error: syncError } = await supabase
        .from('sync_tracking')
        .select('last_sync_at')
        .eq('sync_type', 'shopify_orders')
        .single();

      if (syncError) {
        console.log('⚠️  No sync tracking found, using last 7 days as default');
        lastSyncAt = new Date();
        lastSyncAt.setDate(lastSyncAt.getDate() - 7);
      } else {
        lastSyncAt = new Date(syncData.last_sync_at);
        console.log(`📅 Last sync was at: ${lastSyncAt.toISOString()}`);
      }
    } catch (error) {
      console.log('⚠️  Error reading sync tracking, using last 7 days as default');
      lastSyncAt = new Date();
      lastSyncAt.setDate(lastSyncAt.getDate() - 7);
    }
  }

  const sinceISO = lastSyncAt.toISOString();
  const syncStartTime = new Date().toISOString();

  while (hasNextPage) {
    let query, variables;

    if (cursor) {
      query = `
        query getOrders($cursor: String!) {
          orders(first: 250, after: $cursor, query: "updated_at:>\\\"${sinceISO}\\\"") {
            edges {
              node {
                id
                createdAt
                updatedAt
                displayFinancialStatus
                customer {
                  id
                  email
                  firstName
                  lastName
                }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      variantTitle
                      quantity
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;
      variables = { cursor };
    } else {
      query = `
        query getOrders {
          orders(first: 250, query: "updated_at:>\\\"${sinceISO}\\\"") {
            edges {
              node {
                id
                createdAt
                updatedAt
                displayFinancialStatus
                customer {
                  id
                  email
                  firstName
                  lastName
                }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      variantTitle
                      quantity
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;
      variables = {};
    }

    const response = await shopifyGraphQL(query, variables);

    const ordersData = response.body.data.orders;

    for (const edge of ordersData.edges) {
      const orderNode = edge.node;
      const customer = orderNode.customer;

      if (!customer || !customer.email) {
        continue;
      }

      // Skip refunded orders
      if (orderNode.displayFinancialStatus === 'REFUNDED') {
        console.log(`⏭️  Skipping refunded order for ${customer.email}`);
        continue;
      }

      // Sync customer first (ignore if already exists)
      const customerData = {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName || '',
        lastName: customer.lastName || ''
      };

      try {
        await syncCustomer(customerData, customer.id.split('/').pop());
      } catch (error) {
        // Ignore duplicate customer errors - customer already exists
        if (error.code !== '23505') {
          throw error;
        }
      }

      // Process line items for course purchases
      for (const itemEdge of orderNode.lineItems.edges) {
        const item = itemEdge.node;
        const productTitle = item.title || '';
        const variantTitle = item.variantTitle || '';
        const quantity = item.quantity || 1;

        // Check if this is a pottery course
        if (productTitle.toLowerCase().includes('wheelthrowing') ||
            productTitle.toLowerCase().includes('handbuilding') ||
            productTitle.toLowerCase().includes('pottery course')) {

          // Handle multi-pax orders (qty > 1 = multiple enrollments)
          const paxCount = Math.max(1, quantity);
          if (paxCount > 1) {
            console.log(`👥 ${paxCount}-pax order detected for ${customer.email} - ${productTitle}`);
          }

          const extraPaxPlaceholders = [];
          for (let paxIndex = 0; paxIndex < paxCount; paxIndex++) {
            const isExtraPax = paxIndex > 0;
            const paxSuffix = isExtraPax ? `-${paxIndex + 1}` : '';
            const paxEmail = isExtraPax
              ? customer.email.replace('@', `+dup${paxIndex > 1 ? paxIndex : ''}@`)
              : customer.email;

            if (isExtraPax) {
              console.log(`👥 Processing pax ${paxIndex + 1}/${paxCount}: ${paxEmail}`);

              // Create duplicate customer record for extra pax (own account/portfolio).
              // Sets a synthetic shopify_customer_id (NOT NULL) and surfaces failures.
              try {
                const { createDuplicatePaxCustomer } = require('../utils/supabaseDb');
                const placeholder = await createDuplicatePaxCustomer({
                  baseEmail: customer.email,
                  paxEmail,
                  firstName: customer.firstName || '',
                  lastName: `${customer.lastName || ''} (${paxIndex + 1})`,
                  paxIndex
                });
                extraPaxPlaceholders.push(placeholder);
              } catch (err) {
                console.error(`❌ Could not create extra-pax customer ${paxEmail}:`, err.message);
                continue; // skip this spot; keep processing the rest of the order
              }
            }

            console.log(`🎓 Processing: ${paxEmail} - ${productTitle}`);

            // Skip orders older than 6 months — prevents old courses from creating future enrollments
            if (orderNode.createdAt && new Date(orderNode.createdAt) < new Date(Date.now() - 180 * 86400000)) {
              console.log(`⏭️  Skipping old order ${orderNode.id} from ${orderNode.createdAt}`);
              skippedCount++;
              continue;
            }

            // Prepare order and line item objects
            const order = {
              id: orderNode.id.split('/').pop(),
              createdAt: orderNode.createdAt,
              customer: {
                email: paxEmail,
                first_name: isExtraPax ? (customer.firstName || '') : customer.firstName,
                last_name: isExtraPax ? `${customer.lastName || ''} (${paxIndex + 1})` : customer.lastName
              }
            };

            const lineItem = {
              id: item.id.split('/').pop() + paxSuffix,
              title: productTitle,
              variantTitle: variantTitle
            };

            // Process the course purchase
            const result = await processCoursePurchase(order, lineItem);

            if (result.success) {
              if (result.skipped) {
                skippedCount++;
              } else {
                enrollmentsCreated++;

                // Auto-send course details email for new HB enrollments
                if (result.isHandbuilding && result.enrollment) {
                  try {
                    const enrollment = result.enrollment;
                    const courseIdForEmail = enrollment.course_identifier || `HB_${enrollment.id}`;
                    // Check if email was already sent (avoid duplicates during re-sync)
                    const { data: alreadySent } = await supabase
                      .from('sent_emails')
                      .select('id')
                      .eq('email_type', 'course_details')
                      .eq('course_identifier', courseIdForEmail)
                      .limit(1)
                      .maybeSingle();

                    if (!alreadySent && paxEmail) {
                      const credits = enrollment.number_of_weeks || enrollment.class_credits_allocated || 4;
                      const templateType = credits <= 4 ? 'hb-4credit' : 'hb-8credit';

                      // Check config to see if auto-send is enabled
                      let autoSendEnabled = true;
                      try {
                        const hbConfig = courseConfig.getConfig(templateType);
                        if (hbConfig && hbConfig.email_auto_send === false) {
                          autoSendEnabled = false;
                        }
                      } catch (e) { /* config not loaded, default to sending */ }

                      if (autoSendEnabled) {
                        const template = require(`../email-templates/courses/${templateType}`);
                        const { subject: emailSubject, html: emailHtml } = template.generate({ specialNotes: '' });

                        await sendAndLogEmail({
                          emailType: 'course_details',
                          courseIdentifier: courseIdForEmail,
                          subject: emailSubject,
                          html: emailHtml,
                          recipientEmails: [paxEmail],
                          sentBy: 'system',
                        });
                        console.log(`📧 HB course details email auto-sent to ${paxEmail}`);
                      } else {
                        console.log(`[Shopify] Skipping auto-email for ${templateType} — auto-send disabled in config`);
                      }
                    }
                  } catch (emailErr) {
                    console.error('[Email] Failed to auto-send HB course details email:', emailErr);
                  }
                }

                if (result.thresholdMet) {
                  console.log(`✅ Created classes and bookings for ${paxEmail}`);
                } else if (result.requiresThreshold) {
                  console.log(`⏳ Enrollment created, waiting for threshold (${result.studentCount}/${result.studentsNeeded + result.studentCount})`);
                } else {
                  console.log(`✅ Enrollment created for ${paxEmail}`);
                }
              }
            }

            processedCount++;
          }

          // One details-request email for the whole order covering every extra
          // spot (idempotent inside — re-syncs never re-email the purchaser).
          if (extraPaxPlaceholders.length > 0) {
            const { createStudentDetailsRequests } = require('../utils/studentDetailsRequest');
            createStudentDetailsRequests({
              placeholders: extraPaxPlaceholders,
              purchaserEmail: customer.email,
              purchaserFirstName: customer.firstName || '',
              courseTitle: productTitle,
              orderId: orderNode.id.split('/').pop(),
            }).catch(err => console.error('[StudentDetails] request failed:', err.message));
          }
        } else if (productTitle.toLowerCase().includes('clay club')) {
          // ── Clay Club membership sync ──────────────────────────────────
          const { findCustomerByEmail, createMembership } = require('../utils/supabaseDb');
          const memberCustomer = await findCustomerByEmail(customer.email);
          if (!memberCustomer) {
            console.log(`⚠️  Clay Club order for unknown customer: ${customer.email}`);
          } else {
            // Parse duration from variant or title
            const combined = (productTitle + ' ' + variantTitle).toLowerCase();
            let months = 6; // default
            if (combined.includes('12 month')) months = 12;
            else if (combined.includes('1 month')) months = 1;
            else if (combined.includes('3 month')) months = 3;
            else if (combined.includes('6 month')) months = 6;

            const membershipType = `Clay Club ${months} Month${months !== 1 ? 's' : ''}`;
            const purchaseDate = new Date(orderNode.createdAt).toISOString().split('T')[0];

            // Idempotency: one membership row per purchase, keyed by
            // (customer, purchase_date, type). Re-syncs of the same order skip.
            const { data: existing } = await supabase
              .from('memberships')
              .select('id, status')
              .eq('customer_id', memberCustomer.id)
              .eq('purchase_date', purchaseDate)
              .eq('membership_type', membershipType)
              .maybeSingle();

            if (existing) {
              // Already recorded. Leave its status alone — activation from
              // pending → active is the studio manager's call on first visit.
              console.log(`⏭️  Membership already recorded for ${customer.email} (${membershipType}, purchased ${purchaseDate})`);
              skippedCount++;
            } else {
              // New purchase → create as PENDING (reserved). The term does NOT
              // start now; it begins on the member's first studio visit, when
              // the studio manager activates it (sets start/end dates).
              await createMembership({
                customerId: memberCustomer.id,
                membershipType,
                status: 'pending',
                startDate: null,
                endDate: null,
                purchaseDate,
                perks: {}
              });
              console.log(`🎫 Reserved (pending) membership for ${customer.email}: ${membershipType} (purchased ${purchaseDate})`);
              enrollmentsCreated++;

              // Send the confirmation email from this reliable sync path (the
              // Shopify order webhook is not a guaranteed delivery channel).
              // Dedup per purchase so re-syncs / the webhook can't double-send.
              try {
                const courseIdentifier = `MEMBERSHIP_${months}M_${purchaseDate}`;
                const { data: alreadySent } = await supabase
                  .from('sent_emails')
                  .select('id')
                  .eq('email_type', 'membership_confirmed')
                  .eq('course_identifier', courseIdentifier)
                  .contains('recipient_emails', [memberCustomer.email])
                  .maybeSingle();

                if (!alreadySent) {
                  const membershipSettings = await readMembershipSettings();
                  const purchasedOnLabel = new Date(orderNode.createdAt)
                    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                  const { subject, html } = generateMembershipConfirmedEmail({
                    firstName: memberCustomer.first_name || '',
                    months,
                    purchaseDate: purchasedOnLabel,
                    accessCode: membershipSettings.accessCode,
                    studioHours: membershipSettings.studioHours,
                  });
                  await sendAndLogEmail({
                    emailType: 'membership_confirmed',
                    courseIdentifier,
                    subject,
                    html,
                    recipientEmails: [memberCustomer.email],
                    sentBy: 'system',
                  });
                  console.log(`📧 Membership confirmation email sent to ${memberCustomer.email} (${months} months, purchased ${purchaseDate})`);
                }
              } catch (emailErr) {
                console.error('[Email] Failed to send membership confirmation (sync path):', emailErr);
              }
            }
          }
          processedCount++;
        }
      }
    }

    hasNextPage = ordersData.pageInfo.hasNextPage;
    if (hasNextPage && ordersData.edges.length > 0) {
      cursor = ordersData.edges[ordersData.edges.length - 1].cursor;
    }
  }

  console.log(`✅ Processed ${processedCount} course purchases, created ${enrollmentsCreated} enrollments`);

  // Update membership expiry statuses
  let membershipsExpired = 0;
  try {
    const now = new Date().toISOString().split('T')[0];
    const { data: expiredMemberships, error: expError } = await supabase
      .from('memberships')
      .select('id, customer_id, membership_type, end_date')
      .eq('status', 'active')
      .lt('end_date', now);

    if (!expError && expiredMemberships && expiredMemberships.length > 0) {
      const expiredIds = expiredMemberships.map(m => m.id);
      const { error: updateExpError } = await supabase
        .from('memberships')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .in('id', expiredIds);

      if (!updateExpError) {
        membershipsExpired = expiredIds.length;
        console.log(`🎫 Expired ${membershipsExpired} membership(s): ${expiredMemberships.map(m => m.membership_type).join(', ')}`);
      } else {
        console.error('⚠️  Failed to expire memberships:', updateExpError);
      }
    }
  } catch (error) {
    console.error('⚠️  Error checking membership expiry:', error);
  }

  // Update last sync timestamp
  try {
    const { supabase } = require('../utils/supabaseDb');
    const { error: updateError } = await supabase
      .from('sync_tracking')
      .upsert({
        sync_type: 'shopify_orders',
        last_sync_at: syncStartTime,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'sync_type'
      });

    if (updateError) {
      console.error('⚠️  Failed to update sync timestamp:', updateError);
    } else {
      console.log(`✅ Updated last sync timestamp to ${syncStartTime}`);
    }
  } catch (error) {
    console.error('⚠️  Error updating sync timestamp:', error);
  }

  // Auto-complete enrollments where all booked classes have passed
  const autoCompleted = await autoCompleteFinishedEnrollments();

  // Sync customer_type based on active memberships
  const customerTypesUpdated = await supabaseDb.syncCustomerTypeFromMemberships();

  res.json({
    success: true,
    message: `Processed ${processedCount} course purchases, created ${enrollmentsCreated} new enrollments, ${skippedCount} already existed, ${membershipsExpired} memberships expired` + (autoCompleted > 0 ? `, auto-completed ${autoCompleted} finished enrollments` : '') + (customerTypesUpdated > 0 ? `, updated ${customerTypesUpdated} customer types` : ''),
    processedCount,
    enrollmentsCreated,
    skippedCount,
    membershipsExpired,
    autoCompleted,
    customerTypesUpdated
  });

}));

// Shopify webhook HMAC verification middleware
function verifyShopifyWebhook(req, res, next) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) {
    console.error('Missing Shopify HMAC header');
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error('SHOPIFY_API_SECRET not configured');
    return res.status(500).json({ error: 'Webhook verification not configured' });
  }

  const crypto = require('crypto');
  // req.body is a Buffer from express.raw(), use it directly for HMAC
  const body = Buffer.isBuffer(req.body) ? req.body : (req.rawBody || '');
  const digest = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) {
      console.error('Invalid Shopify HMAC');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } catch (e) {
    console.error('HMAC comparison failed:', e.message);
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
}

/**
 * Shopify signs the raw body, so express.raw() hands us a Buffer — never a
 * string. Parse it before anything reads a field off it: a Buffer answers
 * `undefined` to every property, so a skipped parse is indistinguishable from
 * an order with no customer, and the webhook 200s while doing nothing.
 * Returns null when the payload can't be parsed.
 */
function parseWebhookBody(req) {
  try {
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return req.body || null;
  } catch (err) {
    console.error('[Webhook] Could not parse body:', err.message);
    return null;
  }
}

// Shopify webhook for order creation.
// Acknowledge inside Shopify's 5s window, then process: enrollment creation,
// emails and calendar sync together take far longer than that.
app.post('/api/shopify/webhook/orders', express.raw({ type: 'application/json' }), verifyShopifyWebhook, (req, res) => {
  console.log('📦 Received order webhook from Shopify');
  console.log('Shop:', req.headers['x-shopify-shop-domain']);

  const orderData = parseWebhookBody(req);
  res.status(200).json({ received: true });

  if (!orderData) return;
  processOrderWebhook(orderData).catch(err =>
    console.error('[Webhook] Unhandled failure processing order webhook:', err)
  );
});

async function processOrderWebhook(orderData) {
  try {
    // Extract customer information
    const customer = orderData.customer;

    if (!customer || !customer.email) {
      console.log('⚠️ Order has no customer email, skipping');
      return;
    }

    console.log(`👤 Processing customer: ${customer.email}`);

    // Sync customer to database
    const customerData = {
      id: `gid://shopify/Customer/${customer.id}`,
      email: customer.email,
      firstName: customer.first_name || '',
      lastName: customer.last_name || ''
    };

    const dbCustomer = await syncCustomer(customerData, customer.id.toString());

    console.log(`✅ Customer ${customer.email} synced successfully`);

    // Process line items to check for course purchases
    if (orderData.line_items && orderData.line_items.length > 0) {
      const { enrollAllPax } = require('../utils/courseEnrollmentManager');

      for (const item of orderData.line_items) {
        const productTitle = item.title || '';
        const variantTitle = item.variant_title || '';

        console.log(`📝 Processing item: ${productTitle} - ${variantTitle}`);

        // Check if this is a pottery course
        if (productTitle.toLowerCase().includes('wheelthrowing') ||
            productTitle.toLowerCase().includes('handbuilding') ||
            productTitle.toLowerCase().includes('pottery course')) {

          console.log(`🎓 Course detected: ${productTitle} - ${variantTitle}`);

          // Prepare order and line item objects for processCoursePurchase
          const order = {
            id: orderData.id.toString(),
            createdAt: orderData.created_at,
            customer: {
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name
            }
          };

          const lineItem = {
            id: item.id.toString(),
            title: productTitle,
            variantTitle: variantTitle
          };

          // Process the course purchase using the new enrollment manager.
          // Honor quantity: qty 2 = 2 spots = 2 enrollments (one dup customer per extra spot).
          const results = await enrollAllPax({
            order,
            lineItem,
            customer: { email: customer.email, firstName: customer.first_name, lastName: customer.last_name },
            quantity: item.quantity || 1
          });
          // Downstream (VES Credit, threshold) keys off the primary buyer's spot.
          const result = results[0] || { success: false };

          if (result.success) {
            console.log(`✅ Course enrollment processed successfully`);

            // Award VES Credit for returning students
            // For WT courses awaiting threshold: defer credit until course is confirmed
            const shouldDeferCredit = result.requiresThreshold && !result.thresholdMet;
            if (shouldDeferCredit) {
              console.log(`⏳ Deferring VES Credit for ${customer.email} — course awaiting confirmation`);
            } else {
              try {
                const { isReturningStudent, earnCredits, getCreditBalance } = require('../utils/creditManager');
                const { sendEmail } = require('../utils/emailService');
                const returning = await isReturningStudent(dbCustomer.id);
                if (returning) {
                  const creditTxn = await earnCredits({
                    customerId: dbCustomer.id,
                    amount: 20,
                    source: 'course_purchase',
                    referenceId: result.enrollment?.id?.toString(),
                    description: `Ves is 10 — $20 credit for ${productTitle}`,
                  });
                  console.log(`💰 Awarded $20 VES Credit to ${customer.email}`);

                  // Send credit earned email (credits category may be paused)
                  try {
                    const { isEmailCategoryPaused } = require('../utils/emailService');
                    if (isEmailCategoryPaused('credits')) {
                      console.log('[Credits] Email paused — skipping credit earned email');
                    } else {
                      const { generate: generateCreditEarned } = require('../email-templates/credits-earned');
                      const newBalance = await getCreditBalance(dbCustomer.id);
                      const { subject, html } = generateCreditEarned({
                        firstName: customer.first_name,
                        amountEarned: 20,
                        courseName: productTitle,
                        newBalance,
                      });
                      await sendEmail({ to: customer.email, subject, html });
                    }
                  } catch (emailErr) {
                    console.error('[Credits] Failed to send credit earned email:', emailErr);
                  }
                }
              } catch (creditErr) {
                console.error('[Credits] Failed to award credit:', creditErr);
              }
            }

            // Auto-send course details email for HB enrollments immediately
            if (result.isHandbuilding && result.enrollment) {
              try {
                const enrollment = result.enrollment;
                const studentEmail = customer.email;
                if (studentEmail) {
                  const credits = enrollment.number_of_weeks || enrollment.class_credits_allocated || 4;
                  const templateType = credits <= 4 ? 'hb-4credit' : 'hb-8credit';

                  // Check config to see if auto-send is enabled for this course type
                  let autoSendEnabled = true; // default to true for backward compatibility
                  try {
                    const hbConfig = courseConfig.getConfig(templateType);
                    if (hbConfig && hbConfig.email_auto_send === false) {
                      autoSendEnabled = false;
                    }
                  } catch (e) { /* config not loaded, default to sending */ }

                  if (autoSendEnabled) {
                    const template = require(`../email-templates/courses/${templateType}`);
                    const { subject: emailSubject, html: emailHtml } = template.generate({ specialNotes: '' });

                    await sendAndLogEmail({
                      emailType: 'course_details',
                      courseIdentifier: enrollment.course_identifier || `HB_${enrollment.id}`,
                      subject: emailSubject,
                      html: emailHtml,
                      recipientEmails: [studentEmail],
                      sentBy: 'system',
                    });
                    console.log(`📧 HB course details email auto-sent to ${studentEmail}`);
                  } else {
                    console.log(`[Shopify] Skipping auto-email for ${templateType} — auto-send disabled in config`);
                  }
                }
              } catch (emailErr) {
                console.error('[Email] Failed to auto-send HB course details email:', emailErr);
              }
            }

            if (result.thresholdMet) {
              console.log(`🎉 Threshold met! Created ${result.classInstancesCreated} class instances and ${result.bookingsCreated} bookings`);
              // Course details email (which serves as confirmation) will be sent via admin compose flow
            } else if (result.requiresThreshold) {
              console.log(`⏳ Waiting for more students (${result.studentCount}/${result.studentsNeeded + result.studentCount})`);
            }
          } else {
            console.error(`❌ Failed to process course enrollment: ${result.error}`);
          }
        }
      }
    }

    // Check for kids course purchases and auto-send outreach email
    if (orderData.line_items && orderData.line_items.length > 0) {
      for (const item of orderData.line_items) {
        const title = (item.title || '').toLowerCase();
        if (title.includes('kids') || title.includes('play with clay')) {
          try {
            const parentEmail = customer.email;
            if (parentEmail) {
              const { subject, html } = generateKidsOutreachEmail({
                parentName: customer.first_name || '',
              });
              await sendAndLogEmail({
                emailType: 'kids_outreach',
                courseIdentifier: 'KIDS',
                subject,
                html,
                recipientEmails: [parentEmail],
                sentBy: 'system',
              });
              console.log(`📧 Kids outreach email sent to ${parentEmail}`);
            }
          } catch (emailErr) {
            console.error('[Email] Failed to send kids outreach:', emailErr);
          }
        }
      }
    }

    // Check for membership purchases and auto-send confirmation email
    if (orderData.line_items && orderData.line_items.length > 0) {
      for (const item of orderData.line_items) {
        const title = (item.title || '').toLowerCase();
        const variant = (item.variant_title || '').toLowerCase();
        if (title.includes('clay club')) {
          try {
            const memberEmail = customer.email;
            if (memberEmail) {
              const combined = title + ' ' + variant;
              let months = 6;
              if (combined.includes('12 month')) months = 12;
              else if (combined.includes('1 month')) months = 1;
              else if (combined.includes('3 month')) months = 3;
              else if (combined.includes('6 month')) months = 6;

              const orderDate = new Date(orderData.created_at);
              const purchaseDate = orderDate.toISOString().split('T')[0];
              const formatDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

              // Dedup per purchase so the webhook and the order-sync sweep can't
              // both send. Keyed by purchase date, matching the sweep's identifier.
              const courseIdentifier = `MEMBERSHIP_${months}M_${purchaseDate}`;
              const { data: alreadySent } = await supabaseDb.supabase
                .from('sent_emails')
                .select('id')
                .eq('email_type', 'membership_confirmed')
                .eq('course_identifier', courseIdentifier)
                .contains('recipient_emails', [memberEmail])
                .maybeSingle();

              if (!alreadySent) {
                const membershipSettings = await readMembershipSettings();
                const { subject, html } = generateMembershipConfirmedEmail({
                  firstName: customer.first_name || '',
                  months,
                  purchaseDate: formatDate(orderDate),
                  accessCode: membershipSettings.accessCode,
                  studioHours: membershipSettings.studioHours,
                });
                await sendAndLogEmail({
                  emailType: 'membership_confirmed',
                  courseIdentifier,
                  subject,
                  html,
                  recipientEmails: [memberEmail],
                  sentBy: 'system',
                });
                console.log(`📧 Membership confirmation email sent to ${memberEmail} (${months} months, purchased ${purchaseDate})`);
              }
            }
          } catch (emailErr) {
            console.error('[Email] Failed to send membership confirmation:', emailErr);
          }
        }
      }
    }

    // Check for voucher purchases and auto-send outreach email
    if (orderData.line_items && orderData.line_items.length > 0) {
      for (const item of orderData.line_items) {
        const title = (item.title || '').toLowerCase();
        if (title.includes('voucher') || title.includes('gift voucher')) {
          try {
            const buyerEmail = customer.email;
            const { isEmailCategoryPaused } = require('../utils/emailService');
            if (buyerEmail && isEmailCategoryPaused('vouchers')) {
              console.log('[Voucher] Email paused — skipping voucher outreach email');
            } else if (buyerEmail) {
              const { subject, html } = generateVoucherOutreachEmail({
                buyerName: customer.first_name || '',
                courseVariant: item.variant_title || item.title || 'Pottery Course',
              });
              await sendAndLogEmail({
                emailType: 'voucher_outreach',
                courseIdentifier: 'VOUCHER',
                subject,
                html,
                recipientEmails: [buyerEmail],
                sentBy: 'system',
              });
              console.log(`📧 Voucher outreach email sent to ${buyerEmail}`);
            }

            // Auto-create voucher record for admin tracking
            const purchaserLookup = await supabaseDb.supabase
              .from('customers')
              .select('id')
              .eq('email', customer.email)
              .single();

            await supabaseDb.supabase.from('vouchers').insert({
              purchaser_customer_id: purchaserLookup?.data?.id || null,
              purchaser_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
              purchaser_email: customer.email,
              shopify_order_id: String(orderData.id),
              shopify_order_name: orderData.name || `#${orderData.order_number}`,
              product_title: item.title || 'Pottery Course Voucher',
              variant_title: item.variant_title || null,
              amount: parseFloat(item.price) || null,
              status: 'pending',
            });
            console.log(`🎫 Voucher record created for order ${orderData.name}`);
          } catch (emailErr) {
            console.error('[Email/Voucher] Failed to process voucher:', emailErr);
          }
        }
      }
    }

    console.log(`✅ Order webhook processed: ${orderData.name || orderData.id}`);

  } catch (error) {
    // Shopify has already been acked, so nothing retries this — the manual
    // order sync is the backstop. Log loudly enough to notice.
    console.error('Error processing Shopify order webhook:', error);
  }
}

// Shopify webhook for customer creation
app.post('/api/shopify/webhook/customers', express.raw({ type: 'application/json' }), verifyShopifyWebhook, (req, res) => {
  console.log('👤 Received customer webhook from Shopify');
  console.log('Shop:', req.headers['x-shopify-shop-domain']);

  const customerData = parseWebhookBody(req);
  res.status(200).json({ received: true });

  if (!customerData) return;
  processCustomerWebhook(customerData).catch(err =>
    console.error('[Webhook] Unhandled failure processing customer webhook:', err)
  );
});

async function processCustomerWebhook(customerData) {
  try {
    if (!customerData.email) {
      console.log('⚠️ Customer has no email, skipping');
      return;
    }

    console.log(`👤 Processing new customer: ${customerData.email}`);

    const formattedCustomer = {
      id: `gid://shopify/Customer/${customerData.id}`,
      email: customerData.email,
      firstName: customerData.first_name || '',
      lastName: customerData.last_name || ''
    };

    await syncCustomer(formattedCustomer, customerData.id.toString());

    console.log(`✅ Customer ${customerData.email} synced successfully`);

  } catch (error) {
    console.error('Error processing Shopify customer webhook:', error);
  }
}

// ============================================
// VOUCHER BACKFILL FROM SHOPIFY
// ============================================

app.post('/api/admin/vouchers/backfill', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  console.log('🎁 Starting voucher backfill from Shopify...');
  const { supabase } = supabaseDb;

  let processedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    let query, variables;

    if (cursor) {
      query = `
        query getVoucherOrders($cursor: String!) {
          orders(first: 250, after: $cursor, query: "Gift Voucher") {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                customer {
                  id
                  email
                  firstName
                  lastName
                }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      variantTitle
                      quantity
                      originalUnitPriceSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;
      variables = { cursor };
    } else {
      query = `
        query getVoucherOrders {
          orders(first: 250, query: "Gift Voucher") {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                customer {
                  id
                  email
                  firstName
                  lastName
                }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      variantTitle
                      quantity
                      originalUnitPriceSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;
      variables = {};
    }

    const response = await shopifyGraphQL(query, variables);

    const orders = response?.body?.data?.orders;
    if (!orders || !orders.edges || orders.edges.length === 0) {
      hasNextPage = false;
      break;
    }

    console.log(`🎁 Backfill: found ${orders.edges.length} orders in this page`);

    for (const edge of orders.edges) {
      const order = edge.node;
      cursor = edge.cursor;
      console.log(`🎁 Order ${order.name}: ${(order.lineItems?.edges || []).map(e => e.node.title).join(', ')}`);

      // Extract numeric Shopify order ID
      const shopifyOrderId = order.id.replace('gid://shopify/Order/', '');

      // Check each line item for voucher products
      for (const liEdge of (order.lineItems?.edges || [])) {
        const lineItem = liEdge.node;
        const title = (lineItem.title || '').toLowerCase();

        if (!title.includes('voucher') && !title.includes('gift')) {
          continue;
        }

        processedCount++;
        const lineItemId = lineItem.id.replace('gid://shopify/LineItem/', '');

        // Check if voucher already exists for this order + line item
        const { data: existing } = await supabase
          .from('vouchers')
          .select('id')
          .eq('shopify_order_id', shopifyOrderId)
          .eq('shopify_line_item_id', lineItemId)
          .maybeSingle();

        if (existing) {
          skippedCount++;
          continue;
        }

        // Look up purchaser by email
        let purchaserCustomerId = null;
        const customerEmail = order.customer?.email;
        if (customerEmail) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id')
            .eq('email', customerEmail.toLowerCase())
            .maybeSingle();
          if (customer) {
            purchaserCustomerId = customer.id;
          }
        }

        const amount = lineItem.originalUnitPriceSet?.shopMoney?.amount
          ? parseFloat(lineItem.originalUnitPriceSet.shopMoney.amount)
          : null;

        // Create voucher record
        const { error: insertErr } = await supabase
          .from('vouchers')
          .insert({
            shopify_order_id: shopifyOrderId,
            shopify_line_item_id: lineItemId,
            shopify_order_name: order.name || null,
            purchaser_customer_id: purchaserCustomerId,
            purchaser_name: order.customer ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() : null,
            purchaser_email: customerEmail || null,
            product_title: lineItem.title,
            variant_title: lineItem.variantTitle || null,
            amount: amount,
            currency: lineItem.originalUnitPriceSet?.shopMoney?.currencyCode || 'SGD',
            status: 'pending',
            purchased_at: order.createdAt,
            created_at: new Date().toISOString()
          });

        if (insertErr) {
          console.error(`❌ Error creating voucher for order ${shopifyOrderId}:`, insertErr.message);
        } else {
          createdCount++;
          console.log(`✅ Created voucher from order ${order.name || shopifyOrderId}: ${lineItem.title}`);
        }
      }
    }

    hasNextPage = orders.pageInfo.hasNextPage;
  }

  console.log(`🎁 Voucher backfill complete: ${processedCount} processed, ${createdCount} created, ${skippedCount} skipped`);
  res.json({
    success: true,
    processed: processedCount,
    created: createdCount,
    skipped: skippedCount
  });
}));

};
