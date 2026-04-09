'use strict';

const { google } = require('googleapis');
const { supabase } = require('./supabaseDb');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Returns the Google OAuth consent URL for Gmail access.
 */
function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

/**
 * Exchanges an auth code for tokens and stores the refresh token in admin_settings.
 */
async function handleCallback(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error('No refresh token returned. Ensure prompt=consent was used.');
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('admin_settings')
    .upsert(
      { setting_key: 'gmail_refresh_token', setting_value: tokens.refresh_token, updated_at: now },
      { onConflict: 'setting_key' }
    );

  if (error) {
    throw new Error(`Failed to store refresh token: ${error.message}`);
  }

  return tokens;
}

/**
 * Loads the refresh token from DB and returns an authenticated Gmail client.
 * Returns null if no token is stored.
 */
async function getGmailClient() {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'gmail_refresh_token')
    .single();

  if (error || !data || !data.setting_value) {
    return null;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: data.setting_value });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Parses a "From" header like `"Name" <email@example.com>` or `email@example.com`.
 * Returns { fromName, fromEmail }.
 */
function parseFromHeader(fromHeader) {
  if (!fromHeader) return { fromName: '', fromEmail: '' };

  const match = fromHeader.match(/^"?([^"<]*?)"?\s*<([^>]+)>/);
  if (match) {
    return {
      fromName: match[1].trim(),
      fromEmail: match[2].trim().toLowerCase(),
    };
  }

  // Plain email with no display name
  return {
    fromName: '',
    fromEmail: fromHeader.trim().toLowerCase(),
  };
}

/**
 * Decodes a base64url-encoded string to UTF-8 text.
 */
function decodeBase64Url(encoded) {
  if (!encoded) return '';
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Recursively finds the text/plain part in a MIME message payload.
 */
function extractPlainTextBody(payload) {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractPlainTextBody(part);
      if (result) return result;
    }
  }

  return '';
}

/**
 * Fetches unread emails from the last N days.
 * Filters out newsletters (List-Unsubscribe header) and noreply senders.
 * Returns an array of email objects.
 */
async function fetchUnreadEmails(days = 7) {
  const gmail = await getGmailClient();
  if (!gmail) return [];

  const cutoffTimestamp = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const query = [
    'is:unread',
    `after:${cutoffTimestamp}`,
    '-category:promotions',
    '-category:social',
    '-from:noreply',
    '-from:no-reply',
  ].join(' ');

  let messageIds;
  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });
    messageIds = listRes.data.messages || [];
  } catch (err) {
    console.error('[gmailClient] fetchUnreadEmails list error:', err.message);
    return [];
  }

  const emails = [];

  for (const { id } of messageIds) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });

      const msg = msgRes.data;
      const headers = msg.payload && msg.payload.headers ? msg.payload.headers : [];

      const getHeader = (name) => {
        const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
        return h ? h.value : '';
      };

      // Filter out newsletters via List-Unsubscribe header
      if (getHeader('List-Unsubscribe')) continue;

      const fromHeader = getHeader('From');
      const { fromName, fromEmail } = parseFromHeader(fromHeader);

      // Extra guard on noreply in email address
      if (/no.?reply/i.test(fromEmail)) continue;

      const subject = getHeader('Subject');
      const messageIdHeader = getHeader('Message-ID');
      const receivedAt = msg.internalDate
        ? new Date(parseInt(msg.internalDate, 10)).toISOString()
        : null;

      let body = extractPlainTextBody(msg.payload);
      if (!body) body = msg.snippet || '';

      // Truncate to 2000 chars
      if (body.length > 2000) body = body.slice(0, 2000);

      emails.push({
        gmailMessageId: msg.id,
        gmailThreadId: msg.threadId,
        fromName,
        fromEmail,
        subject,
        body,
        snippet: msg.snippet || '',
        receivedAt,
        messageIdHeader,
      });
    } catch (err) {
      console.error(`[gmailClient] fetchUnreadEmails get message ${id} error:`, err.message);
    }
  }

  return emails;
}

/**
 * Sends a plain text reply in the same Gmail thread.
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Plain text body
 * @param {string} params.threadId - Gmail thread ID to reply in
 * @param {string} [params.messageId] - Original Message-ID header for In-Reply-To/References
 */
async function sendReply({ to, subject, body, threadId, messageId }) {
  const gmail = await getGmailClient();
  if (!gmail) throw new Error('Gmail not connected');

  const subjectLine = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const headers = [
    `To: ${to}`,
    `Subject: ${subjectLine}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
  ];

  if (messageId) {
    headers.push(`In-Reply-To: ${messageId}`);
    headers.push(`References: ${messageId}`);
  }

  const rawMessage = headers.join('\r\n') + '\r\n\r\n' + body;
  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId,
    },
  });

  return res.data;
}

/**
 * Checks if Gmail is connected and working.
 * Returns true if getProfile succeeds, false otherwise.
 */
async function isConnected() {
  const gmail = await getGmailClient();
  if (!gmail) return false;

  try {
    await gmail.users.getProfile({ userId: 'me' });
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getGmailClient,
  fetchUnreadEmails,
  sendReply,
  isConnected,
};
