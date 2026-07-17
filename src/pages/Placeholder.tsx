import { PageHeader } from '@/components/layout/PageHeader';

export default function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description ?? 'Dieser Bereich befindet sich in Vorbereitung.'} />
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        Inhalte folgen in Kürze.
      </div>
    </div>
  );
}
