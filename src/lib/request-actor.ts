// Ator da auditoria a partir do cookie de papel da demo (rotas de API; sem login).
import { demoRoleSwitchEnabled } from "@/lib/config";
import { DEMO_USERS } from "@/seed/demo-data";

export function actorFromRequest(request: Request): `usuario:${string}` {
  const cookie = request.headers.get("cookie") ?? "";
  const role = /(?:^|;\s*)demo_papel=([^;]+)/.exec(cookie)?.[1];
  const user = (demoRoleSwitchEnabled() && DEMO_USERS.find((u) => u.role === role)) || DEMO_USERS[0];
  return `usuario:${user.id}`;
}
