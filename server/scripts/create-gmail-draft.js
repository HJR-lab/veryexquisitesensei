/**
 * Create a Gmail draft (optionally threaded, optionally with attachments) using
 * the studio's own Gmail connection.
 *
 * The MCP Gmail tool can only take an attachment as base64 pasted into the tool
 * call, which is unreliable for anything but the smallest file. This reads the
 * file off disk instead, using the refresh token the admin Inbox already stores
 * in admin_settings.gmail_refresh_token (scopes: gmail.modify/send/readonly).
 *
 * Drafts only — nothing here sends. Justin sends.
 *
 * Usage:
 *   node scripts/create-gmail-draft.js \
 *     --to chloe@example.com \
 *     --subject "Re: Invoice" \
 *     --html-file /tmp/body.html \
 *     [--text-file /tmp/body.txt] \
 *     [--reply-to <gmail message id>] \
 *     [--attach /path/to/file.pdf]...
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { supabase } = require('../utils/supabaseDb');

function parseArgs(argv) {
  const args = { to: [], attach: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key || !key.startsWith('--') || value === undefined) {
      throw new Error(`Bad argument near "${key}"`);
    }
    switch (key) {
      case '--to': args.to.push(value); break;
      case '--attach': args.attach.push(value); break;
      case '--subject': args.subject = value; break;
      case '--html-file': args.htmlFile = value; break;
      case '--text-file': args.textFile = value; break;
      case '--reply-to': args.replyTo = value; break;
      default: throw new Error(`Unknown argument ${key}`);
    }
  }
  if (args.to.length === 0) throw new Error('--to is required');
  if (!args.subject) throw new Error('--subject is required');
  if (!args.htmlFile) throw new Error('--html-file is required');
  return args;
}

async function gmailClient() {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'gmail_refresh_token')
    .single();
  if (error || !data?.setting_value) {
    throw new Error('No gmail_refresh_token in admin_settings — reconnect Gmail in Admin → Inbox.');
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: data.setting_value });
  return google.gmail({ version: 'v1', auth });
}

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.csv': 'text/csv',
  '.ics': 'text/calendar',
};

/** RFC 2047 encoding, so a subject with an em dash or accent survives. */
function encodeHeader(value) {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildMime({ from, to, subject, text, html, attachments, inReplyTo, references }) {
  const alt = `alt_${Date.now()}`;
  const mixed = `mixed_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
    lines.push(`References: ${references || inReplyTo}`);
  }
  lines.push(`Content-Type: multipart/mixed; boundary="${mixed}"`, '');

  lines.push(`--${mixed}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '');
  lines.push(`--${alt}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '');
  lines.push(Buffer.from(text, 'utf8').toString('base64'));
  lines.push(`--${alt}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '');
  lines.push(Buffer.from(html, 'utf8').toString('base64'));
  lines.push(`--${alt}--`, '');

  for (const file of attachments) {
    const name = path.basename(file);
    const mime = MIME_BY_EXT[path.extname(file).toLowerCase()] || 'application/octet-stream';
    lines.push(`--${mixed}`, `Content-Type: ${mime}; name="${name}"`, 'Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${name}"`, '');
    lines.push(fs.readFileSync(file).toString('base64').replace(/(.{76})/g, '$1\n'));
  }

  lines.push(`--${mixed}--`, '');
  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gmail = await gmailClient();

  const profile = await gmail.users.getProfile({ userId: 'me' });
  const from = profile.data.emailAddress;

  let inReplyTo = null;
  let references = null;
  let threadId;
  if (args.replyTo) {
    const original = await gmail.users.messages.get({
      userId: 'me',
      id: args.replyTo,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References'],
    });
    const headers = original.data.payload.headers || [];
    const header = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
    inReplyTo = header('Message-ID');
    references = [header('References'), inReplyTo].filter(Boolean).join(' ');
    threadId = original.data.threadId;
  }

  const html = fs.readFileSync(args.htmlFile, 'utf8');
  const text = args.textFile
    ? fs.readFileSync(args.textFile, 'utf8')
    : html.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();

  const raw = buildMime({
    from,
    to: args.to,
    subject: args.subject,
    text,
    html,
    attachments: args.attach,
    inReplyTo,
    references,
  });

  const draft = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: threadId ? { raw, threadId } : { raw } },
  });

  console.log(JSON.stringify({
    draftId: draft.data.id,
    messageId: draft.data.message?.id,
    threadId: draft.data.message?.threadId,
    attachments: args.attach.map((f) => path.basename(f)),
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
