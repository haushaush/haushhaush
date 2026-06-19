import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TrendingUp, FileText, Calendar, User } from "lucide-react";
import { formatValue } from "@/lib/utils";

interface CloseOpportunity {
  id: string;
  lead_name: string | null;
  client_id: string | null;
  value: number | null;
  value_cents: number | null;
  value_formatted: string | null;
  value_currency: string | null;
  status_type: string | null;
  status_label: string | null;
  date_won: string | null;
  user_name: string | null;
}

type TimePeriod = "7d" | "30d" | "year" | "all";

const PERIODS: { label: string; value: TimePeriod }[] = [
  { label: "Letzte 7 Tage", value: "7d" },
  { label: "Letzte 30 Tage", value: "30d" },
  { label: "Dieses Jahr", value: "year" },
  { label: "Insgesamt", value: "all" },
];

function getPeriodStart(period: TimePeriod): Date | null {
  const now = new Date();
  if (period === "all") return null;
  if (period === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (period === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  return new Date(now.getFullYear(), 0, 1);
}

function getOppValue(o: CloseOpportunity): number {
  if (o.value != null) return Number(o.value) || 0;
  if (o.value_cents != null) return Number(o.value_cents) / 100;
  return 0;
}

export default function SalesUebersicht() {
  const [opps, setOpps] = useState<CloseOpportunity[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>("30d");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("close_opportunities")
        .select("id, lead_name, client_id, value, value_cents, value_formatted, value_currency, status_type, status_label, date_won, user_name")
        .eq("status_type", "won")
        .order("date_won", { ascending: false })
        .limit(5000);

      if (error) console.error("Error fetching opportunities:", error);
      const rows = (data || []) as CloseOpportunity[];
      setOpps(rows);

      const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];
      if (clientIds.length) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id, name")
          .in("id", clientIds);
        const map: Record<string, string> = {};
        (clients || []).forEach((c: any) => { map[c.id] = c.name; });
        setClientNames(map);
      }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const start = getPeriodStart(period);
    if (!start) return opps;
    return opps.filter((o) => {
      if (!o.date_won) return false;
      return new Date(o.date_won) >= start;
    });
  }, [opps, period]);

  const totalRevenue = useMemo(
    () => filtered.reduce((sum, o) => sum + getOppValue(o), 0),
    [filtered]
  );

  const formatDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("de-DE") : "–");

  const periodLabel = PERIODS.find((p) => p.value === period)?.label;

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Sales Übersicht
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Umsatz auf Basis gewonnener Close-Opportunities
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.value}
            variant={period === p.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p.value)}
            className="rounded-lg"
          >
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Umsatz geschrieben
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-40" />
            ) : (
              <div className="text-3xl font-bold tabular-nums tracking-tight">
                {formatValue(totalRevenue, 'currency')}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Gewonnene Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <div className="text-3xl font-bold tabular-nums tracking-tight">
                {filtered.length}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
          </CardContent>
        </Card>

        <Card className="border border-dashed border-border bg-card/50 opacity-60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Umsatz eingegangen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums tracking-tight text-muted-foreground">–</div>
            <p className="text-xs text-muted-foreground mt-1">Bald verfügbar</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Gewonnene Opportunities im Zeitraum ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Keine gewonnenen Opportunities im Zeitraum</p>
              <p className="text-xs mt-1">
                Wähle einen anderen Zeitraum oder prüfe die Daten in Close.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kunde</TableHead>
                    <TableHead className="text-right">Wert</TableHead>
                    <TableHead>Gewonnen am</TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> Closer
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => {
                    const name =
                      (o.client_id && clientNames[o.client_id]) ||
                      o.lead_name ||
                      "–";
                    const valueDisplay =
                      o.value_formatted ||
                      (o.value != null || o.value_cents != null
                        ? formatValue(getOppValue(o), 'currency')
                        : "–");
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium text-sm">{name}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {valueDisplay}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(o.date_won)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {o.user_name || "–"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
