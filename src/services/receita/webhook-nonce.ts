// Nonce do webhook: aleatório (128 bits), único por solicitação, guardado só como hash (docs/03).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function newWebhookNonce(): { nonce: string; hash: string } {
  const nonce = randomBytes(16).toString("base64url");
  return { nonce, hash: hashNonce(nonce) };
}

export function hashNonce(nonce: string): string {
  return createHash("sha256").update(`rfb-webhook:${nonce}`).digest("hex");
}

export function nonceMatches(nonce: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashNonce(nonce), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** URL de retorno só quando há APP_URL https (a Receita faz HEAD nela); senão "" (sem webhook). */
export function webhookUrl(appUrl: string | undefined, requestId: string, nonce: string): string {
  const base = appUrl?.trim().replace(/\/$/, "");
  if (!base || !base.startsWith("https://")) return "";
  return `${base}/api/receita/webhook/${requestId}/${nonce}`;
}
