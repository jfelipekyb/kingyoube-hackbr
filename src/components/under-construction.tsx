import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 min-w-0 [overflow-wrap:anywhere]">
      <h1>{title}</h1>
      {description ? <p className="mt-2 max-w-3xl text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function UnderConstruction({ title, description, session }: { title: string; description: string; session: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardHeader>
          <CardTitle>Em construção</CardTitle>
          <CardDescription>Esta tela chega na sessão {session} do backlog.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          A base de demonstração já está carregada; enquanto isso, veja a Carteira e a Auditoria.
        </CardContent>
      </Card>
    </>
  );
}
