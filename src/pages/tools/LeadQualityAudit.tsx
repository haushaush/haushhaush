import { ShieldCheck, Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function LeadQualityAudit() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Lead Quality Audit
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hier entsteht das Audit-Tool für Lead-Qualität.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="rounded-full bg-muted p-4 mb-5">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm max-w-md">
            Funktionalität in Planung — sag Bescheid welche Audit-Logik du brauchst.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
