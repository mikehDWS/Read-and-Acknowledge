import nodemailer, { type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html: string };

/**
 * Email goes out over SMTP (Microsoft 365, Google Workspace or any mail service).
 * Set MAIL_TRANSPORT=log to print emails to the server log instead of sending them.
 */
export function mailConfigured(): boolean {
  return process.env.MAIL_TRANSPORT === "log" || (!!process.env.SMTP_HOST && !!process.env.MAIL_FROM);
}

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  if (transporter) return transporter;
  if (process.env.MAIL_TRANSPORT === "log") {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!mailConfigured()) throw new Error("Email isn't set up: set SMTP_HOST and MAIL_FROM");
  const info = await getTransport().sendMail({
    from: process.env.MAIL_FROM || "Read and Acknowledge <no-reply@localhost>",
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  if (process.env.MAIL_TRANSPORT === "log") {
    console.log(`[mail] to=${mail.to} subject=${JSON.stringify(mail.subject)}`);
    void info;
  }
}
