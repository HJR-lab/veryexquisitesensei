const supabaseDb = require('./supabaseDb');
const { sendAndLogEmail } = require('./emailService');
const { publicBaseUrl } = require('./publicUrl');

/**
 * Tell a student their pieces are ready: email first, in-app notification second,
 * and the notification can never take the email down with it.
 *
 * THE ORDER IS THE POINT. Three routes mark a batch ready — single status update,
 * bulk status update, and firing-run completion — and each used to inline its own
 * copy of this. Two of them created the in-app notification first, unguarded. When
 * notifications.data turned out to be missing in prod, that insert threw PGRST204
 * before the email line was ever reached, so those two routes 500'd and sent
 * nothing, while firing-run completion (which never notified) kept working. For
 * four months whether a student heard that their pottery was ready depended purely
 * on which admin button was pressed. The email is the message that matters; the
 * notification is a bonus.
 *
 * @param {object} batch a piece_batches row with customers + course_enrollments joined
 * @returns {Promise<{emailed:boolean, notified:boolean, reason?:string}>}
 */
async function sendPiecesReady(batch) {
  const student = batch?.customers;
  if (!student?.email) {
    return { emailed: false, notified: false, reason: 'no-recipient' };
  }

  const courseName = batch.course_enrollments?.course_title
    || batch.course_enrollments?.course_variant_title
    || 'your course';
  const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
  const appUrl = publicBaseUrl();
  const plural = batch.piece_count !== 1;

  const piecesReadyTemplate = require('../email-templates/pieces/pieces-ready');
  const { subject, html } = piecesReadyTemplate.generate({
    studentName: student.first_name || 'there',
    courseName,
    pieceCount: batch.piece_count,
    photoUrl,
    appUrl,
  });

  const result = await sendAndLogEmail({
    emailType: 'pieces-ready',
    courseIdentifier: batch.course_enrollments?.course_identifier || `batch-${batch.id}`,
    subject,
    html,
    recipientEmails: [student.email],
    sentBy: 'system',
  });

  let notified = false;
  try {
    await supabaseDb.createNotification({
      customerId: student.id,
      type: 'pieces_ready',
      title: 'Your pottery is ready!',
      message: `Your ${batch.piece_count} piece${plural ? 's' : ''} from ${courseName} ${plural ? 'have' : 'has'} been fired and ${plural ? 'are' : 'is'} ready for collection.`,
      data: { batchId: batch.id, pieceCount: batch.piece_count, courseName, photoUrl },
    });
    notified = true;
  } catch (error) {
    console.error(
      `[pieces] in-app notification failed for batch ${batch.id} (email ${result.success ? 'sent' : 'FAILED'}):`,
      error.message
    );
  }

  return { emailed: Boolean(result.success), notified };
}

module.exports = { sendPiecesReady };
