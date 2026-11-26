"use client";

import { useTransition } from "react";
import { selectCompany, switchRole } from "@/app/actions";

const selectClass =
  "h-9 rounded-kyb-botao border border-kyb-linha bg-kyb-branco px-2.5 text-sm text-kyb-azul transition-colors duration-150 ease-kyb hover:border-kyb-azul focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kyb-azul-2 disabled:opacity-60";

export function CompanySelector({ companies, value }: { companies: { id: string; name: string }[]; value: string | null }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Cliente</span>
      <select
        aria-label="Seletor de cliente"
        className={selectClass}
        disabled={pending}
        value={value ?? ""}
        onChange={(e) => start(() => selectCompany(e.target.value))}
      >
        <option value="">Toda a carteira ({companies.length})</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RoleSelector({ value, users }: { value: string; users: { role: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Papel na demo</span>
      <select
        aria-label="Seletor de papel da demo"
        className={selectClass}
        disabled={pending}
        value={value}
        onChange={(e) => start(() => switchRole(e.target.value))}
      >
        {users.map((u) => (
          <option key={u.role} value={u.role}>
            {u.name} ({u.role})
          </option>
        ))}
      </select>
    </label>
  );
}
