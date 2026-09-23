import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { config } from '../config';
import { AppError } from '../errors/AppError';

/**
 * Email delivery for DeliveryOS.
 *
 * - When SMTP_HOST is configured, real emails are sent through SMTP
 *   (production path).
 * - When SMTP is NOT configured:
 *   - in production the app refuses to silently swallow mail: sending throws
 *     so the failure is surfaced instead of pretending an email went out;
 *   - in development/test, each message is written as a real .eml file into a
 *     local "dev mailbox" and a short notice (recipient + subject + file path
 *     only) is logged. The mailbox is fully readable/functional for the
 *     developer, and no invite token ever appears in the log stream.
 */
const SMTP_CONFIGURED = Boolean(config.email.smtpHost);

export interface SendMailResult {
  transport: 'smtp' | 'dev-mailbox';
  messageId?: string;
  savedPath?: string;
}

function buildTransporter() {
  return nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpSecure,
    auth: config.email.smtpUser
      ? { user: config.email.smtpUser, pass: config.email.smtpPass }
      : undefined,
  });
}

function buildEml(to: string, subject: string, text: string, html: string): string {
  const from = config.email.from;
  const lines: string[] = [];
  const pushHeader = (key: string, value: string) =>
    lines.push(`${key}: ${value.replace(/\r?\n/g, '').trim()}`);

  pushHeader('From', from);
  pushHeader('To', to);
  pushHeader('Subject', subject);
  pushHeader('Date', new Date().toUTCString());
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/html; charset="utf-8"');
  lines.push('Content-Transfer-Encoding: 8bit');
  lines.push('');
  lines.push(html);
  lines.push('');
  lines.push('--');
  lines.push('This is a DeliveryOS dev-environment email captured by the local mailbox.');
  lines.push('Configure SMTP_HOST/SMTP_USER/SMTP_PASS to deliver real emails.');
  return lines.join('\n');
}

class EmailService {
  /**
   * Delivers an email. See module docs for the transport policy.
   */
  async send(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<SendMailResult> {
    const { to, subject, text, html } = options;

    if (SMTP_CONFIGURED) {
      const transporter = buildTransporter();
      const info = await transporter.sendMail({
        from: config.email.from,
        to,
        subject,
        text,
        html,
      });
      return { transport: 'smtp', messageId: info.messageId };
    }

    if (config.isProd) {
      throw new AppError(
        'EMAIL_NOT_CONFIGURED',
        'Cannot deliver email: SMTP_HOST is not configured for this environment',
        500
      );
    }

    // Dev/test: write a functional email to the local mailbox instead of
    // pretending it was sent. Only recipient + subject are logged so invite
    // tokens carried in the body are never leaked into the log stream.
    const dir = config.email.devMailDir;
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `deliveryos-${stamp}.eml`);
    fs.writeFileSync(file, buildEml(to, subject, text, html), 'utf8');
    console.log(
      `[DELIVERYOS EMAIL] dev-mailbox → to="${to}" subject="${subject.replace(/"/g, "'")}" saved=${file}`
    );
    return { transport: 'dev-mailbox', savedPath: file };
  }

  /**
   * Invitation email containing the one-time accept-invite link.
   */
  async sendInvitationEmail(options: { to: string; firstName: string; inviteUrl: string }) {
    const { to, firstName, inviteUrl } = options;
    const subject = "You've been invited to DeliveryOS";
    const text = `Hi ${firstName},\n\n` +
      'You have been invited to join DeliveryOS — the software house operating platform.\n\n' +
      `Open the link below within 7 days to accept your invitation and set a password (it can only be used once):\n\n${inviteUrl}\n\n` +
      'If you did not expect this invitation, you can safely ignore this email.\n\n— The DeliveryOS team';
    const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">` +
      `<h2 style="margin:0 0 8px">Welcome to DeliveryOS</h2>` +
      `<p>Hi ${firstName},</p>` +
      `<p>You have been invited to join <strong>DeliveryOS</strong> — the software house operating platform.</p>` +
      `<p>Open the link below within <strong>7 days</strong> to accept your invitation and set a password. The link can only be used <strong>once</strong>.</p>` +
      `<p style="margin:20px 0"><a href="${inviteUrl}" style="background:#4338ca;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Accept my invitation</a></p>` +
      `<p style="font-size:12px;color:#64748b">If the button does not work, copy and paste this link into your browser:<br/>${inviteUrl}</p>` +
      `<p style="font-size:12px;color:#64748b">If you did not expect this invitation, you can safely ignore this email.</p>` +
      `<p>— The DeliveryOS team</p></div>`;
    return this.send({ to, subject, text, html });
  }
}

export const emailService = new EmailService();