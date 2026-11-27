import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/under-construction";
import { getDb } from "@/db/client";
import { latestSummary } from "@/services/kim/resumo";
import { voiceConfig } from "@/services/kim/voz";
import { KimScreen } from "./kim-screen";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function KimPage({ searchParams }: { searchParams: Promise<{ pergunta?: string }> }) {
  const { pergunta } = await searchParams;
  const summary = await latestSummary(getDb());
  return (
    <>
      <PageHeader title="Kim" description="A gestora da equipe: resume a carteira e responde por voz, com os números da base. Ela fala, mas não decide." />
      <KimScreen voiceOn={voiceConfig() !== null} initialQuestion={pergunta?.slice(0, 500)} />
      <Card className="mt-6" data-channel="whatsapp">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle aria-hidden className="size-4 text-kyb-azul" strokeWidth={1.75} /> Resumo do dia no WhatsApp
            <span className="rounded-kyb-selo border border-kyb-linha px-2 py-0.5 text-xs font-normal text-kyb-mudo">simulado</span>
          </CardTitle>
          <CardDescription>A Kim manda o resumo ao contador no fim de cada rodada. Nenhum envio real: a mensagem fica registrada e auditada.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary ? (
            <div className="rounded-kyb-botao border border-kyb-linha bg-kyb-canvas p-3" aria-label="Prévia da conversa no WhatsApp">
              <p className="mb-2 text-xs text-kyb-mudo">{summary.toLabel}</p>
              <div className="ml-auto max-w-md rounded-kyb-botao bg-kyb-branco p-3 text-sm whitespace-pre-line shadow-sm">{summary.body}</div>
              <p className="mt-1 text-right text-xs text-kyb-mudo">{dateTime.format(summary.createdAt)}</p>
            </div>
          ) : (
            <p className="text-sm text-kyb-mudo">Rode a equipe na Sala da Equipe e o resumo do dia aparece aqui.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
