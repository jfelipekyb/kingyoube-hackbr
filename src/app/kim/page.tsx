import { PageHeader } from "@/components/under-construction";
import { voiceConfig } from "@/services/kim/voz";
import { KimScreen } from "./kim-screen";

export const dynamic = "force-dynamic";

export default async function KimPage({ searchParams }: { searchParams: Promise<{ pergunta?: string }> }) {
  const { pergunta } = await searchParams;
  return (
    <>
      <PageHeader title="Kim" description="A gestora da equipe: resume a carteira e responde por voz, com os números da base. Ela fala, mas não decide." />
      <KimScreen voiceOn={voiceConfig() !== null} initialQuestion={pergunta?.slice(0, 500)} />
    </>
  );
}
