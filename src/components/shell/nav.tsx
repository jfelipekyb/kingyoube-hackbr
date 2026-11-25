"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Equipe ao vivo" },
  { href: "/kim", label: "Kim" },
  { href: "/carteira", label: "Carteira" },
  { href: "/sincronizacao", label: "Sincronização" },
  { href: "/conciliacao", label: "Conciliação" },
  { href: "/fornecedores", label: "Fornecedores" },
  { href: "/rad", label: "RAD" },
  { href: "/radar", label: "Radar" },
  { href: "/equipe", label: "Equipe" },
  { href: "/auditoria", label: "Auditoria" },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
