// Leitura do HTML público para o smoke (sem dependências): só o que a tela já mostra.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/<!-- -->/g, "");

/** `<option value="uuid">Nome</option>` do seletor de cliente → id do primeiro cliente cujo nome começa com `name`. */
export function findCompanyId(html: string, name: string): string | null {
  const re = new RegExp(`<option[^>]*value="(${UUID})"[^>]*>([^<]*(?:<!-- -->[^<]*)*)</option>`, "gi");
  for (const m of html.matchAll(re)) {
    if (decode(m[2]).trim().startsWith(name)) return m[1];
  }
  return null;
}

/** Linha da tabela de propostas que contém todos os `needles` → id da proposta (link `/rad/<id>`). */
export function findProposalId(html: string, needles: string[]): string | null {
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const text = decode(row.split(/<\/tr>/i)[0]);
    if (!needles.every((n) => text.includes(n))) continue;
    const m = new RegExp(`href="/rad/(${UUID})`, "i").exec(text);
    if (m) return m[1];
  }
  return null;
}
