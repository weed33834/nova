/**
 * 邮件通知服务 — 基于 nodemailer，支持任意 SMTP 服务器。
 *
 * 配置环境变量：
 * - SMTP_HOST: SMTP 服务器地址
 * - SMTP_PORT: 端口（默认 587）
 * - SMTP_USER: 用户名
 * - SMTP_PASS: 密码
 * - SMTP_FROM: 发件人地址（默认 noreply@nova.local）
 *
 * 未配置 SMTP_HOST 时所有方法静默返回（不影响主流程）。
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { createLogger } from '@/lib/logger';

const log = createLogger('Mail');

let transporter: Transporter | null = null;
let configured = false;

function getTransporter(): Transporter | null {
  if (!configured) {
    configured = true;
    const host = process.env.SMTP_HOST;
    if (!host) return null;

    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
    });
    log.info('SMTP transporter configured', { host });
  }
  return transporter;
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** 邮件模板（不含收件人，调用时合并） */
export type MailTemplate = Omit<MailOptions, 'to'>;

/** 发送邮件。SMTP 未配置时静默跳过。 */
export async function sendMail(opts: MailOptions): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    log.debug('SMTP not configured, skipping email', { to: opts.to, subject: opts.subject });
    return false;
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'Nova <noreply@nova.local>',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    log.info('Email sent', { to: opts.to, subject: opts.subject });
    return true;
  } catch (err) {
    log.error('Failed to send email', { to: opts.to, subject: opts.subject, err });
    return false;
  }
}

// ── 预置邮件模板 ──────────────────────────────────────────────────────────

export function welcomeEmail(name: string, loginUrl: string): MailTemplate {
  return {
    subject: 'Welcome to Nova',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Welcome to Nova, ${name}!</h2>
        <p>Your account has been created successfully. You can now create AI-powered interactive classrooms.</p>
        <a href="${loginUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">Get Started</a>
        <p style="color: #6b7280; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
    text: `Welcome to Nova, ${name}! Your account has been created. Visit ${loginUrl} to get started.`,
  };
}

export function passwordResetEmail(name: string, resetUrl: string): MailTemplate {
  return {
    subject: 'Reset your Nova password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Hi ${name}, we received a request to reset your password.</p>
        <a href="${resetUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">Reset Password</a>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
    text: `Hi ${name}, reset your password at ${resetUrl}. This link expires in 1 hour.`,
  };
}

export function classroomReadyEmail(name: string, classroomName: string, url: string): MailTemplate {
  return {
    subject: `Your classroom "${classroomName}" is ready`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Classroom Ready</h2>
        <p>Hi ${name}, your classroom "${classroomName}" has been generated successfully.</p>
        <a href="${url}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">Open Classroom</a>
      </div>
    `,
    text: `Hi ${name}, your classroom "${classroomName}" is ready. Open it at ${url}.`,
  };
}

export function verificationEmail(name: string, verifyUrl: string): MailTemplate {
  return {
    subject: 'Verify your email address',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Verify Your Email</h2>
        <p>Hi ${name}, please verify your email address to complete registration.</p>
        <a href="${verifyUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">Verify Email</a>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
    text: `Hi ${name}, verify your email at ${verifyUrl}. This link expires in 24 hours.`,
  };
}
