import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Mail Service', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  describe('sendMail', () => {
    it('should silently skip when SMTP is not configured', async () => {
      const { sendMail } = await import('@/lib/server/mail');

      const result = await sendMail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result).toBe(false);
    });

    it('should send email when SMTP is configured', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'testuser';
      process.env.SMTP_PASS = 'testpass';
      process.env.SMTP_FROM = 'Nova <noreply@example.com>';

      const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-123' });
      const createTransportMock = vi.fn().mockReturnValue({
        sendMail: sendMailMock,
      });

      vi.doMock('nodemailer', () => ({
        default: { createTransport: createTransportMock },
        createTransport: createTransportMock,
      }));

      const { sendMail } = await import('@/lib/server/mail');

      const result = await sendMail({
        to: 'user@example.com',
        subject: 'Welcome',
        html: '<p>Welcome!</p>',
        text: 'Welcome!',
      });

      expect(result).toBe(true);
      expect(sendMailMock).toHaveBeenCalledOnce();

      const call = sendMailMock.mock.calls[0][0];
      expect(call.from).toBe('Nova <noreply@example.com>');
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toBe('Welcome');
      expect(call.html).toBe('<p>Welcome!</p>');
      expect(call.text).toBe('Welcome!');

      vi.doUnmock('nodemailer');
    });

    it('should return false on send failure', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';

      const sendMailMock = vi.fn().mockRejectedValue(new Error('SMTP refused'));
      const createTransportMock = vi.fn().mockReturnValue({
        sendMail: sendMailMock,
      });

      vi.doMock('nodemailer', () => ({
        default: { createTransport: createTransportMock },
        createTransport: createTransportMock,
      }));

      const { sendMail } = await import('@/lib/server/mail');

      const result = await sendMail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result).toBe(false);

      vi.doUnmock('nodemailer');
    });
  });

  describe('welcomeEmail template', () => {
    it('should generate a welcome email with the user name and login URL', async () => {
      const { welcomeEmail } = await import('@/lib/server/mail');

      const template = welcomeEmail('Alice', 'https://nova.app/auth/signin');

      expect(template.subject).toBe('Welcome to Nova');
      expect(template.html).toContain('Alice');
      expect(template.html).toContain('https://nova.app/auth/signin');
      expect(template.text).toContain('Alice');
      expect(template.text).toContain('https://nova.app/auth/signin');
    });
  });

  describe('passwordResetEmail template', () => {
    it('should generate a password reset email with the reset URL', async () => {
      const { passwordResetEmail } = await import('@/lib/server/mail');

      const template = passwordResetEmail('Bob', 'https://nova.app/reset?token=abc');

      expect(template.subject).toBe('Reset your Nova password');
      expect(template.html).toContain('Bob');
      expect(template.html).toContain('https://nova.app/reset?token=abc');
      expect(template.text).toContain('1 hour');
    });
  });

  describe('classroomReadyEmail template', () => {
    it('should generate a classroom-ready notification with the classroom name', async () => {
      const { classroomReadyEmail } = await import('@/lib/server/mail');

      const template = classroomReadyEmail('Carol', 'Biology 101', 'https://nova.app/c/cls_123');

      expect(template.subject).toContain('Biology 101');
      expect(template.html).toContain('Carol');
      expect(template.html).toContain('Biology 101');
      expect(template.html).toContain('https://nova.app/c/cls_123');
    });
  });

  describe('verificationEmail template', () => {
    it('should generate an email verification template with the verify URL', async () => {
      const { verificationEmail } = await import('@/lib/server/mail');

      const template = verificationEmail('Dave', 'https://nova.app/verify?token=xyz');

      expect(template.subject).toBe('Verify your email address');
      expect(template.html).toContain('Dave');
      expect(template.html).toContain('https://nova.app/verify?token=xyz');
      expect(template.text).toContain('24 hours');
    });
  });
});
