"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LockedButton } from "@/components/ui/locked-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface PremiseRow {
  tipo: "tarefa" | "projecao";
  chave: string;
  label: string;
  valor: number;
  unidade: string;
  atualizadoPor: string;
}

function Row({ row, canEdit }: { row: PremiseRow; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(row.valor));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputId = `premissa-${row.chave}`;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/equipe/premissas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: row.tipo, chave: row.chave, valor: Number(value) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.erro === "string" ? json.erro : `Falha (HTTP ${res.status})`);
      setMsg({ ok: true, text: "Salvo e registrado na auditoria." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha inesperada" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <label htmlFor={inputId}>{row.label}</label>
        <span className="block text-rotulo text-muted-foreground">Mudou por último: {row.atualizadoPor}</span>
      </TableCell>
      <TableCell className="text-right">
        <span className="inline-flex items-center gap-1">
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            readOnly={!canEdit}
            aria-readonly={!canEdit}
            className="h-8 w-20 rounded-kyb-botao border border-kyb-linha bg-kyb-branco px-2 text-right tabular-nums read-only:bg-kyb-canvas"
          />
          <span className="text-rotulo text-muted-foreground">{row.unidade}</span>
        </span>
      </TableCell>
      <TableCell className="text-right">
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={save} disabled={busy || value === String(row.valor)}>
            Salvar
          </Button>
        ) : (
          <LockedButton size="sm" reason="Só o contador muda premissa.">
            Salvar
          </LockedButton>
        )}
        {msg ? (
          <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "block text-rotulo text-kyb-verde-texto" : "block text-rotulo text-kyb-erro"}>
            {msg.text}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function PremissasTable({ rows, canEdit, caption }: { rows: PremiseRow[]; canEdit: boolean; caption: string }) {
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Premissa</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Ação</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <Row key={`${r.tipo}-${r.chave}-${r.valor}`} row={r} canEdit={canEdit} />
        ))}
      </TableBody>
    </Table>
  );
}
