import fs from 'node:fs';
import path from 'node:path';
import { config, smtpConfigured } from './config.js';
import { headerSafe, logger } from './util.js';

let transport = null;

async function getTransport() {
  if (transport) return transport;
  const nodemailer = (await import('nodemailer')).default;
  transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
  return transport;
}

function writeOutbox(mail, reason) {
  const file = path.join(config.dataDir, 'outbox.jsonl');
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), reason, ...mail }) + '\n');
}

// Sends through the GoDaddy/Titan mailbox when SMTP credentials exist;
// otherwise records the email in data/outbox.jsonl so the flow can still be demoed.
export async function sendMail({ to, subject, text, replyTo }) {
  const mail = { to: headerSafe(to), subject: headerSafe(subject), text: String(text).slice(0, 10_000) };
  if (replyTo) mail.replyTo = headerSafe(replyTo);

  if (!smtpConfigured()) {
    writeOutbox(mail, 'smtp-not-configured');
    return { sent: false, queued: true };
  }
  try {
    const t = await getTransport();
    await t.sendMail({ from: config.mailFrom, ...mail });
    return { sent: true };
  } catch (e) {
    logger.error('mail failed:', e.message);
    writeOutbox(mail, `error: ${e.message}`.slice(0, 200));
    return { sent: false, error: 'Mail delivery failed' };
  }
}

export function notifyOwnerOfSignup(project, variant, signup) {
  if (!config.ownerEmail) return Promise.resolve();
  return sendMail({
    to: config.ownerEmail,
    subject: `New waitlist signup, variant ${variant.label}: ${project.title}`,
    replyTo: signup.email,
    text: `${signup.name || 'Someone'} <${signup.email}> joined the waitlist for variant ${variant.label} ("${variant.angle}").\nPurchase intent: ${signup.intent || 'not answered'}\n${signup.note ? `Note: ${signup.note}\n` : ''}`
  });
}

export function welcomeSignup(project, variant, signup) {
  return sendMail({
    to: signup.email,
    subject: `You're on the list: ${project.title}`,
    text: `Hi ${signup.name || 'there'},\n\nThanks for your interest! You're on the early-access list for "${project.title}".\n\nThis is an early-stage idea we're testing, so nothing is for sale yet. Your feedback is shaping what we build, and we'll email you if it goes ahead. Just reply to this email if you have questions or suggestions.\n\nYou can ask us to remove your details at any time by replying "remove me".\n`
  });
}

export function notifyOwnerOfMessage(project, variant, message) {
  if (!config.ownerEmail) return Promise.resolve();
  return sendMail({
    to: config.ownerEmail,
    subject: `New question (variant ${variant.label}): ${project.title}`,
    replyTo: message.email,
    text: `From: ${message.name || 'Anonymous'} <${message.email}>\n\n${message.text}\n`
  });
}
