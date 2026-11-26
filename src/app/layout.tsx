import type { Metadata } from "next";
import { Georama } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Logo } from "@/components/shell/logo";
import { ModeBadge } from "@/components/shell/mode-badge";
import { Nav } from "@/components/shell/nav";
import { PageTransition } from "@/components/shell/page-transition";
import { Tour } from "@/components/shell/tour";
import { CompanySelector, RoleSelector } from "@/components/shell/selectors";
import { getDb } from "@/db/client";
import { demoToday } from "@/lib/clock";
import { demoRoleSwitchEnabled, OFFICE_NAME, receitaMode } from "@/lib/config";
import { formatDateBR } from "@/lib/dates";
import { currentCompanyId, currentUser } from "@/lib/demo-session";
import { DEMO_USERS } from "@/seed/demo-data";
import { listCompanies } from "@/services/carteira";

const georama = Georama({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-georama",
});

export const metadata: Metadata = {
  title: "Equipe CBS · KingYouBe",
  description: "Equipe digital que confere as notas da carteira com a CBS apurada pela Receita",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const mode = receitaMode();
  const [user, companyId, companies] = await Promise.all([currentUser(), currentCompanyId(), listCompanies(getDb())]);

  return (
    <html lang="pt-BR" className={georama.variable}>
      <body className="font-sans antialiased">
        <a
          href="#conteudo"
          className="sr-only z-50 rounded-kyb-botao bg-kyb-verde px-3 py-2 text-kyb-azul focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Pular para o conteúdo
        </a>
        <div className="flex min-h-screen">
          <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto bg-kyb-azul px-3 py-5 text-kyb-branco">
            <Link href="/" className="kyb-logo-entrada block rounded-kyb-botao px-3 focus-visible:outline-2 focus-visible:outline-kyb-verde" data-tour="logo">
              <Logo variant="negativo" />
              <span className="mt-2 block text-rotulo text-kyb-branco/75">Equipe CBS · Hack Brasil 2026</span>
            </Link>
            <Nav />
            <div className="mt-auto px-3 text-secundario text-kyb-branco/75">
              <Link href="/demo" className="underline underline-offset-4 hover:text-kyb-branco">
                Reiniciar demonstração
              </Link>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 border-b border-kyb-linha bg-kyb-branco">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
                <div className="text-sm font-semibold">{OFFICE_NAME}</div>
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
                    <span className="text-secundario text-muted-foreground">Hoje da demo: {formatDateBR(demoToday())}</span>
                  ) : null}
                  <ModeBadge mode={mode} />
                  <Tour />
                </div>
              </div>
            </header>
            <main id="conteudo" className="mx-auto w-full max-w-(--kyb-largura-max) flex-1 p-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
