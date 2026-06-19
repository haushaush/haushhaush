import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TrendingUp, FileText, Calendar } from "lucide-react";
import { formatValue } from "@/lib/utils";

interface CloseDeal {
  id: string;
  client_name: string;
  wert_eur: number | null;
  start_datum: string | null;
  created_at: string;
}

type TimePeriod = "7d" | "30d" | "year" | "all";

interface PeriodConfig {
  label: string;
  value: TimePeriod;
}

const PERIODS: PeriodConfig[] = [
  { label: "Letzte 7 Tage", value: "7d" },
  { label: "Letzte 30 Tage", value: "30d" },
  { label: "Dieses Jahr", value: "year" },
  { label: "Insgesamt", value: "all" },
];

function getPeriodFilter(period: TimePeriod): { start?: string; end?: string } {
  const now = new Date();
  const end = now.toISOString();

  if (period === "all") return {};
  if (period === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { start: d.toISOString(), end };
  }
  if (period === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return { start: d.toISOString(), end };
  }
  // year
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  return { start: startOfYear.toISOString(), end };
}

function isInPeriod(deal: CloseDeal, period: TimePeriod): boolean {
  if (period === "all") return true;
  const { start, end } = getPeriodFilter(period);
  const dateStr = deal.start_datum || deal.created_at;
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (start && date < new Date(start)) return false;
  if (end && date > new Date(end)) return false;
  return true;
}

export default function SalesUebersicht() {
  const [deals, setDeals] = useState<CloseDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>("30d");

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("close_deals")
        .select("id, client_name, wert_eur, start_datum, created_at")
        .order("start_datum", { ascending: false })
        .limit(2000);

      if (error) {
        console.error("Error fetching deals:", error);
      }
      setDeals(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => isInPeriod(d, period));
  }, [deals, period]);

  const totalRevenue = useMemo(() => {
    return filteredDeals.reduce((sum, d) => sum + (d.wert_eur || 0), 0);
  }, [filteredDeals]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "–";
    return new Date(dateStr).toLocaleDateString("de-DE");
  };

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Sales Übersicht
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Umsatz auf Basis von Close Deals
          </p>
        </div>
      </div>

      {/* Period Selector */}
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Umsatz geschrieben */}
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
                {formatValue(totalRevenue)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {PERIODS.find((p) => p.value === period)?.label}
            </p>
          </CardContent>
        </Card>

        {/* Anzahl Deals */}
        <Card className="border border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Anzahl Abschlüsse
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <div className="text-3xl font-bold tabular-nums tracking-tight">
                {filteredDeals.length}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {PERIODS.find((p) => p.value === period)?.label}
            </p>
          </CardContent>
        </Card>

        {/* Placeholder for future KPI */}
        <Card className="border border-dashed border-border bg-card/50 opacity-60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Umsatz eingegangen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums tracking-tight text-muted-foreground">
              –
            </div>
            <p className="text-xs text-muted-foreground mt-1">Bald verfügbar</p>
          </CardContent>
        </Card>
      </div>

      {/* Deal List */}
      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Abschlüsse im Zeitraum ({filteredDeals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredDeals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Keine Abschlüsse im Zeitraum</p>
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
                    <TableHead className="text-right">Wert (€)</TableHead>
                    <TableHead>Startdatum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium text-sm">
                        {deal.client_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {deal.wert_eur != null
                          ? formatValue(deal.wert_eur)
                          : "–"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(deal.start_datum)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
