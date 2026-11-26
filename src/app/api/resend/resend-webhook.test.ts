import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { signSvix } from "@/services/notificacao/svix";
import { createTestDb } from "@/test/db";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));
const { POST } = await import("./webhook/route");
const secret = `whsec_${Buffer.from("segredo-de-teste-456").toString("base64")}`;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
});
afterAll(() => close());

const req = (body: string, headers: Record<string, string>) => new Request("http://localhost/api/resend/webhook", { method: "POST", body, headers });

describe("POST /api/resend/webhook", () => {
  it("401 sem assinatura ou com assinatura inválida; 200 com assinatura Svix válida", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_x" } });
    const ts = Math.floor(Date.now() / 1000);
    expect((await POST(req(body, {}))).status).toBe(401);
    expect((await POST(req(body, { "svix-id": "m1", "svix-timestamp": String(ts), "svix-signature": "v1,errada" }))).status).toBe(401);
    const ok = await POST(req(body, { "svix-id": "m1", "svix-timestamp": String(ts), "svix-signature": signSvix(secret, "m1", ts, body) }));
    expect(ok.status).toBe(200);
  });
});
