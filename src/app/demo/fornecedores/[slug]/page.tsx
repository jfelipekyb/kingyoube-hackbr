import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatCnpj } from "@/lib/cnpj";
import { buildDemoData, MOINHO_SLUG } from "@/seed/demo-data";

// Site fictício do fornecedor da demonstração (docs/05, docs/06): página pública que o Vigia lê pelo Firecrawl.
const SITES: Record<string, { tagline: string; email: string; city: string; about: string }> = {
  [MOINHO_SLUG]: {
    tagline: "Farinhas especiais para panificação desde 1987",
    email: "financeiro@moinhoestrela.exemplo",
    city: "Campinas (SP)",
    about: "Moagem de trigo e distribuição de farinhas para padarias e confeitarias da região.",
  },
};

const counterparties = buildDemoData("2026-11-20").counterparties;

export const metadata: Metadata = { title: "Moinho Estrela Farinhas (FICTÍCIA) · site fictício", robots: { index: false } };

export default async function SupplierSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = SITES[slug];
  const cp = counterparties.find((c) => c.slug === slug);
  if (!site || !cp) notFound();
  return (
    <article className="mx-auto max-w-2xl space-y-6" data-supplier-site={slug}>
      <p role="note" className="rounded-kyb-botao border border-kyb-linha bg-kyb-canvas-2 p-3 text-sm font-semibold">
        Site fictício para demonstração — empresa, CNPJ e e-mail inventados (Hack Brasil 2026).
      </p>
      <header>
        <h1 className="text-2xl font-semibold">{cp.name}</h1>
        <p className="text-kyb-mudo">{site.tagline}</p>
      </header>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Quem somos</h2>
        <p>{site.about}</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Dados da empresa</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="font-semibold">Razão social</dt>
          <dd>{cp.name}</dd>
          <dt className="font-semibold">CNPJ</dt>
          <dd>{formatCnpj(cp.cnpj)}</dd>
          <dt className="font-semibold">Cidade</dt>
          <dd>{site.city}</dd>
        </dl>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contato do financeiro</h2>
        <p className="text-sm">
          Notas fiscais, boletos e recolhimentos: <a href={`mailto:${site.email}`} className="text-kyb-azul underline underline-offset-4">{site.email}</a>
        </p>
      </section>
    </article>
  );
}
