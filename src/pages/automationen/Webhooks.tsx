import { Card } from '@/components/ui/card';
import { Webhook } from 'lucide-react';

export default function WebhooksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Webhooks</h1>
        <p className="text-sm text-muted-foreground">Alle eingehenden und ausgehenden Webhooks</p>
      </div>
      <Card className="p-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
          <Webhook className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">In Kürze verfügbar</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Hier wirst du bald alle Webhooks zentral verwalten können.
        </p>
      </Card>
    </div>
  );
}
