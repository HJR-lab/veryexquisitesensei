'use strict';

const { google } = require('googleapis');
const { supabase } = require('./supabaseDb');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

function getGmailEnvStatus() {
  return {
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasRedirectUri: Boolean(process.env.GOOGLE_REDIRECT_URI),
  };
}

function assertGmailEnv() {
  const status = getGmailEnvStatus();
  const missing = [];
  if (!status.hasClientId) missing.push('GOOGLE_CLIENT_ID');
  if (!status.hasClientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!status.hasRedirectUri) missing.push('GOOGLE_REDIRECT_URI');
  if (missing.length > 0) {
    throw new Error(`Missing Gmail OAuth environment variables: ${missing.join(', ')}`);
  }
}

function createOAuth2Client() {
  assertGmailEnv();
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

async function handleCallback(code) {
  if (!code) throw new Error('Missing Google OAuth code');
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error('No refresh token returned. Reconnect Gmail with prompt=consent.');
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('admin_settings')
    .upsert(
      { setting_key: 'gmail_refresh_token', setting_value: tokens.refresh_token, updated_at: now },
      { onConflict: 'setting_key' }
    );

  if (error) throw new Error(`Failed to store refresh token: ${error.message}`);
  return tokens;
}

async function getGmailClient() {
  let oauth2Client;
  try {
    oauth2Client = createOAuth2Client();
  } catch (err) {
    console.error('[gmailClient] Gmail OAuth env is incomplete:', err.message);
    return null;
  }

  const { data, error } = await supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'gmail_refresh_token')
    .maybeSingle();

  if (error || !data?.setting_value) return null;

  oauth2Client.setCredentials({ refresh_token: data.setting_value });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function parseFromHeader(fromHeader) {
  if (!fromHeader) return { fromName: '', fromEmail: '' };
  const match = fromHeader.match(/^"?([^"<]*?)"?\s*<([^>]+)>/);
  if (match) {
    return { fromName: match[1].trim(), fromEmail: match[2].trim().toLowerCase() };
  }
  return { fromName: '', fromEmail: fromHeader.trim().toLowerCase() };
}

function decodeBase64Url(encoded) {
  if (!encoded) return '';
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function stripHtml(html) {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractBodyParts(payload, result = { plain: '', html: '' }) {
  if (!payload) return result;
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    result.plain += `${decodeBase64Url(payload.body.data)}\n`;
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    result.html += `${decodeBase64Url(payload.body.data)}\n`;
  }
  if (payload.parts) {
    for (const part of payload.parts) extractBodyParts(part, result);
  }
  return result;
}

function extractPlainTextBody(payload) {
  const parts = extractBodyParts(payload);
  return (parts.plain || stripHtml(parts.html)).trim();
}

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
    const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 50 });
    messageIds = listRes.data.messages || [];
  } catch (err) {
    console.error('[gmailClient] fetchUnreadEmails list error:', err.message);
    return [];
  }

  const emails = [];
  for (const { id } of messageIds) {
    try {
      const msgRes = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const msg = msgRes.data;
      const headers = msg.payload?.headers || [];
      const getHeader = (name) => {
        const h = headers.find((header) => header.name.toLowerCase() === name.toLowerCase());
        return h ? h.value : '';
      };

      if (getHeader('List-Unsubscribe')) continue;
      const fromHeader = getHeader('From');
      const { fromName, fromEmail } = parseFromHeader(fromHeader);
      if (/no.?reply/i.test(fromEmail)) continue;

      const subject = getHeader('Subject');
      const messageIdHeader = getHeader('Message-ID');
      const receivedAt = msg.internalDate ? new Date(parseInt(msg.internalDate, 10)).toISOString() : null;
      let body = extractPlainTextBody(msg.payload) || msg.snippet || '';
      if (body.length > 12000) body = body.slice(0, 12000);

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

async function markMessageHandled(messageId) {
  const gmail = await getGmailClient();
  if (!gmail || !messageId) return null;
  const res = await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
  return res.data;
}

async function sendReply({ to, subject, body, threadId, messageId }) {
  const gmail = await getGmailClient();
  if (!gmail) throw new Error('Gmail not connected');
  if (!body || !body.trim()) throw new Error('Cannot send an empty draft reply');

  const subjectLine = subject?.startsWith('Re:') ? subject : `Re: ${subject || ''}`.trim();
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

  const rawMessage = `${headers.join('\r\n')}\r\n\r\n${body}`;
  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded, threadId } });
  return res.data;
}

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
  getGmailEnvStatus,
  getGmailClient,
  fetchUnreadEmails,
  sendReply,
  markMessageHandled,
  isConnected,
};
