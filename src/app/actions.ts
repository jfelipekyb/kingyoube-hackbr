"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { COMPANY_COOKIE, currentUser, ROLE_COOKIE } from "@/lib/demo-session";
import { DEMO_USERS } from "@/seed/demo-data";
import { recordAudit } from "@/services/auditoria";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30 };

export async function switchRole(role: string) {
  const user = DEMO_USERS.find((u) => u.role === role);
  if (!user) throw new Error("Papel inválido");
  const previous = await currentUser();
  (await cookies()).set(ROLE_COOKIE, user.role, cookieOptions);
  await recordAudit(getDb(), {
    actor: `usuario:${user.id}`,
    action: "demo.papel",
    entity: "sessao_demo",
    result: "ok",
    details: { de: previous.role, para: user.role },
  });
  revalidatePath("/", "layout");
}

export async function selectCompany(companyId: string) {
  const store = await cookies();
  if (companyId) store.set(COMPANY_COOKIE, companyId, cookieOptions);
  else store.delete(COMPANY_COOKIE);
  revalidatePath("/", "layout");
}
