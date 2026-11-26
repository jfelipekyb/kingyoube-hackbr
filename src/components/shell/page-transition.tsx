"use client";

import { usePathname } from "next/navigation";

/** Fade de 150ms na troca de página (desligado com movimento reduzido, via CSS). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="kyb-pagina">
      {children}
    </div>
  );
}
