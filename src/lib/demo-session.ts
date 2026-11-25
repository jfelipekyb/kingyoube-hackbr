import "server-only";
import { cookies } from "next/headers";
import { DEMO_USERS } from "@/seed/demo-data";

export const ROLE_COOKIE = "demo_papel";
export const COMPANY_COOKIE = "demo_cliente";

export type DemoUser = (typeof DEMO_USERS)[number];

/** Papel da demonstração (sem login): Ana Analista ou Carlos Contador. */
export async function currentUser(): Promise<DemoUser> {
  const role = (await cookies()).get(ROLE_COOKIE)?.value;
  return DEMO_USERS.find((u) => u.role === role) ?? DEMO_USERS[0];
}

export async function currentCompanyId(): Promise<string | null> {
  return (await cookies()).get(COMPANY_COOKIE)?.value || null;
}
