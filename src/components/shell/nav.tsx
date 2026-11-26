"use client";

import {
  Briefcase,
  MessageCircle,
  Radar,
  Radio,
  Receipt,
  RefreshCw,
  Scale,
  ScrollText,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; tour?: string };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Equipe ao vivo", icon: Radio },
  { href: "/kim", label: "Kim", icon: MessageCircle, tour: "kim" },
  { href: "/carteira", label: "Carteira", icon: Briefcase, tour: "carteira" },
  { href: "/sincronizacao", label: "Sincronização", icon: RefreshCw },
  { href: "/conciliacao", label: "Conciliação", icon: Scale },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/rad", label: "RAD", icon: Receipt, tour: "rad" },
  { href: "/radar", label: "Radar", icon: Radar },
  { href: "/equipe", label: "Equipe", icon: Users, tour: "equipe" },
  { href: "/auditoria", label: "Auditoria", icon: ScrollText },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon, tour }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            data-tour={tour}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-kyb-botao px-3 py-2 text-sm transition-colors duration-150 ease-kyb focus-visible:outline-2 focus-visible:outline-kyb-verde",
              active
                ? "bg-kyb-azul-2 font-semibold text-kyb-branco before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-kyb-selo before:bg-kyb-verde"
                : "text-kyb-branco/80 hover:bg-kyb-azul-2 hover:text-kyb-branco",
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
