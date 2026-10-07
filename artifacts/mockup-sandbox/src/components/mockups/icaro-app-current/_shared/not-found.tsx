import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Link } from './router';

export default function NotFound() {
  return (
    <div className="grid min-h-[55vh] w-full place-items-center">
      <Card className="mx-4 w-full max-w-md">
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-3">
            <AlertCircle className="h-8 w-8 shrink-0 text-destructive" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-primary">Página não encontrada</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Este endereço não corresponde a uma página do Ícaro.
          </p>
          <Link
            href="/overview"
            className="mt-6 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="link-not-found-overview"
          >
            Voltar para a visão geral
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
