import nodemailer from "nodemailer";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export function createMailCipher(secret) {
  const key = createHash("sha256").update(secret).digest();
  return {
    encrypt(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      const bytes = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final(),
      ]);
      return [iv, cipher.getAuthTag(), bytes]
        .map((v) => v.toString("base64url"))
        .join(".");
    },
    decrypt(payload) {
      const [iv, tag, bytes] = payload
        .split(".")
        .map((v) => Buffer.from(v, "base64url"));
      const cipher = createDecipheriv("aes-256-gcm", key, iv);
      cipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([cipher.update(bytes), cipher.final()]).toString("utf8"),
      );
    },
  };
}
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (v) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        v
      ],
  );
export function createSmtpMailer(
  config,
  createTransport = nodemailer.createTransport,
) {
  const transport = createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: true,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    verify: () => transport.verify(),
    async send({ to, name, url, minutes, deliveryId }) {
      const result = await transport.sendMail({
        from: { name: config.SMTP_FROM_NAME, address: config.SMTP_FROM_EMAIL },
        to,
        subject: "Redefina sua senha",
        messageId: `<recovery-${deliveryId}@${config.SMTP_FROM_EMAIL.split("@")[1]}>`,
        text: `Olá, ${name}.\n\nPara redefinir sua senha, abra: ${url}\n\nO link vale por ${minutes} minutos e só pode ser usado uma vez. Se você não solicitou, ignore este email.`,
        html: `<div style="font:16px/1.6 Arial,sans-serif;color:#202124;max-width:520px;margin:auto;padding:32px"><h1 style="font-size:24px">Redefinir senha</h1><p>Olá, ${escape(name)}.</p><p>Recebemos uma solicitação para recuperar sua conta.</p><p><a style="display:inline-block;background:#b51d2b;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none" href="${escape(url)}">Criar nova senha</a></p><p>Este link vale por ${minutes} minutos e só pode ser usado uma vez.</p><p>Se você não solicitou a alteração, ignore este email.</p></div>`,
      });
      if (!result.accepted?.length) throw new Error("MAIL_REJECTED");
    },
  };
}
