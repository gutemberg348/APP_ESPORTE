import { db } from "../config/database.js";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { hashPassword, newSessionToken } from "../lib/crypto.js";
import { assertAdmin } from "../lib/ticket-rules.js";
import { createMailCipher, createSmtpMailer } from "../lib/mail.js";
import { createPasswordRecoveryStore } from "../models/password-recovery.store.js";
import { setTimeout as delay } from "node:timers/promises";
const store = createPasswordRecoveryStore(db, {
  cipher: createMailCipher(env.MAIL_DATA_SECRET),
  publicUrl: env.PASSWORD_RESET_PUBLIC_URL,
  ttlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
});
const mailer = env.SMTP_ENABLED ? createSmtpMailer(env) : null;
function configured() {
  if (!mailer)
    throw new AppError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "A recuperação por email ainda não está configurada. Fale com o administrador.",
    );
}
const accepted = {
  message:
    "Se houver uma conta ativa com esse email, você receberá um link para redefinir sua senha. Confira também o spam.",
};
export const passwordRecoveryService = {
  async request({ email, portal }) {
    configured();
    const started = performance.now();
    try {
      await store.issue(email, newSessionToken(), portal);
    } finally {
      await delay(Math.max(0, 250 - (performance.now() - started)));
    }
    return accepted;
  },
  validate: (token) => store.inspect(token),
  async reset({ token, password }) {
    await store.consume(token, await hashPassword(password));
    return { message: "Senha alterada. Entre novamente com a nova senha." };
  },
  async forUser(admin, userId) {
    assertAdmin(admin);
    configured();
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new AppError(404, "USER_NOT_FOUND", "Conta não encontrada.");
    await store.issue(
      user.email,
      newSessionToken(),
      user.role === "ADMIN" ? "ADMIN" : "APP",
      admin.id,
    );
    return accepted;
  },
  async status(admin) {
    assertAdmin(admin);
    return {
      enabled: env.SMTP_ENABLED,
      sender: env.SMTP_FROM_EMAIL,
      publicUrl: env.PASSWORD_RESET_PUBLIC_URL,
      ttlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
      deliveries: await store.deliveryStatus(),
    };
  },
  async verify(admin) {
    assertAdmin(admin);
    configured();
    try {
      await mailer.verify();
    } catch {
      throw new AppError(
        502,
        "SMTP_VERIFY_FAILED",
        "Não foi possível autenticar no servidor SMTP. Confira as configurações no .env.",
      );
    }
    return {
      message:
        "Conexão SMTP e autenticação verificadas. Nenhum email de teste foi enviado.",
    };
  },
};
export function startMailWorker() {
  if (!mailer) return async () => {};
  let pending = null,
    stopped = false;
  const tick = () => {
    if (pending || stopped) return;
    pending = store
      .deliver(mailer)
      .catch(() => console.error("MAIL_WORKER_FAILED"))
      .finally(() => {
        pending = null;
      });
  };
  const interval = setInterval(tick, env.MAIL_WORKER_INTERVAL_MS).unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(interval);
    if (pending) await pending;
  };
}
