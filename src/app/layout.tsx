import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ModeBadge } from "@/components/shell/mode-badge";
import { Nav } from "@/components/shell/nav";
import { CompanySelector, RoleSelector } from "@/components/shell/selectors";
import { getDb } from "@/db/client";
import { demoToday } from "@/lib/clock";
import { demoRoleSwitchEnabled, OFFICE_NAME, receitaMode } from "@/lib/config";
import { formatDateBR } from "@/lib/dates";
import { currentCompanyId, currentUser } from "@/lib/demo-session";
import { DEMO_USERS } from "@/seed/demo-data";
import { listCompanies } from "@/services/carteira";

export const metadata: Metadata = {
  title: "Equipe CBS · KingYouBe",
  description: "Equipe digital que confere as notas da carteira com a CBS apurada pela Receita",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const mode = receitaMode();
  const [user, companyId, companies] = await Promise.all([currentUser(), currentCompanyId(), listCompanies(getDb())]);

  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen">
          <aside className="flex w-60 shrink-0 flex-col gap-6 border-r bg-muted/30 p-4">
            <Link href="/" className="px-3">
              <div className="text-lg font-semibold leading-tight">Equipe CBS</div>
              <div className="text-xs text-muted-foreground">KingYouBe · Hack Brasil 2026</div>
            </Link>
            <Nav />
            <div className="mt-auto px-3 text-xs text-muted-foreground">
              <Link href="/demo" className="underline underline-offset-4">
                Reiniciar demonstração
              </Link>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-6 py-3">
              <div className="text-sm font-medium">{OFFICE_NAME}</div>
              <CompanySelector companies={companies} value={companyId} />
              {demoRoleSwitchEnabled() ? (
                <RoleSelector value={user.role} users={DEMO_USERS.map((u) => ({ role: u.role, name: u.name }))} />
              ) : (
                <span className="text-sm text-muted-foreground">
                  {user.name} ({user.role})
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                {mode === "SIMULADO" ? (
                  <span className="text-xs text-muted-foreground">Hoje da demo: {formatDateBR(demoToday())}</span>
                ) : null}
                <ModeBadge mode={mode} />
              </div>
            </header>
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
