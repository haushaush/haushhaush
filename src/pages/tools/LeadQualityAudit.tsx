import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, RefreshCw, Plus, Pencil, Trash2, ExternalLink, ArrowUpDown, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";

import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ShowcaseClient {
  id: string;
  client_name: string;
  website_url: string | null;
}

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

type Status = "aktiv" | "pausiert" | "abgeschlossen";

interface Audit {
  customer_id: string;
  kunde_name: string;
  funnel_link: string;
  kampagnenstart: string;
  audit_fenster_start: string;
  audit_fenster_ende: string;
  zustaendiger_tester: string;
  tester_email: string;
  status: Status;
  letztes_audit_datum: string | null;
  naechstes_audit_datum: string | null;
  notizen: string;
}

const EMPTY_FORM = (): Audit => {
  const today = new Date();
  const plus = (d: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + d);
    return x.toISOString().slice(0, 10);
  };
  return {
    customer_id: "",
    kunde_name: "",
    funnel_link: "",
    kampagnenstart: today.toISOString().slice(0, 10),
    audit_fenster_start: plus(14),
    audit_fenster_ende: plus(21),
    zustaendiger_tester: "",
    tester_email: "",
    status: "aktiv",
    letztes_audit_datum: null,
    naechstes_audit_datum: null,
    notizen: "",
  };
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
};

const statusVariant = (s: Status) => {
  switch (s) {
    case "aktiv": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    case "pausiert": return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "abgeschlossen": return "bg-muted text-muted-foreground border-border";
  }
};

type SortKey = keyof Audit;

export default function LeadQualityAudit() {
  const [rows, setRows] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [sortKey, setSortKey] = useState<SortKey>("customer_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Audit | null>(null);
  const [form, setForm] = useState<Audit>(EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Audit | null>(null);
  const [showcaseClients, setShowcaseClients] = useState<ShowcaseClient[]>([]);
  const [kundePopoverOpen, setKundePopoverOpen] = useState(false);

  const fetchAudits = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("audit-bridge", {
        body: { action: "list" },
      });
      if (error) throw error;
      const list: Audit[] = data?.data || data?.rows || (Array.isArray(data) ? data : []);
      setRows(list);
    } catch (e: any) {
      setError(e?.message || "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAudits(); }, []);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter !== "all") r = r.filter(x => x.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => Object.values(x).some(v => String(v ?? "").toLowerCase().includes(q)));
    }
    const sorted = [...r].sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return sorted;
  }, [rows, search, statusFilter, sortKey, sortDir]);

  const nextCustomerId = useMemo(() => {
    const nums = rows
      .map(r => r.customer_id?.match(/CUST-(\d+)/i)?.[1])
      .filter(Boolean)
      .map(n => parseInt(n!, 10));
    const max = nums.length ? Math.max(...nums) : 0;
    return `CUST-${String(max + 1).padStart(3, "0")}`;
  }, [rows]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM(), customer_id: nextCustomerId });
    setModalOpen(true);
  };

  const openEdit = (a: Audit) => {
    setEditing(a);
    setForm({ ...a });
    setModalOpen(true);
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const submitForm = async () => {
    if (!form.customer_id.trim() || !form.kunde_name.trim()) {
      toast.error("customer_id und kunde_name sind Pflichtfelder");
      return;
    }
    setSaving(true);
    const snapshot = rows;
    // optimistic
    if (editing) {
      setRows(rs => rs.map(r => r.customer_id === editing.customer_id ? form : r));
    } else {
      setRows(rs => [form, ...rs]);
    }
    try {
      const { error } = await supabase.functions.invoke("audit-bridge", {
        body: editing
          ? { action: "update", customer_id: editing.customer_id, data: form }
          : { action: "create", data: form },
      });
      if (error) throw error;
      toast.success(editing ? "Audit aktualisiert" : "Neuer Audit angelegt");
      setModalOpen(false);
      fetchAudits();
    } catch (e: any) {
      setRows(snapshot);
      toast.error(e?.message || "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const cid = deleteTarget.customer_id;
    const snapshot = rows;
    setRows(rs => rs.filter(r => r.customer_id !== cid));
    setDeleteTarget(null);
    try {
      const { error } = await supabase.functions.invoke("audit-bridge", {
        body: { action: "delete", customer_id: cid },
      });
      if (error) throw error;
      toast.success("Eintrag gelöscht");
      fetchAudits();
    } catch (e: any) {
      setRows(snapshot);
      toast.error(e?.message || "Löschen fehlgeschlagen");
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-muted-foreground" />
              Lead Quality Audit
            </h1>
            <p className="text-sm text-muted-foreground mt-1 tabular-nums">
              {loading ? "Lade…" : `${filtered.length} Audits`} · Daten aus Google Sheets
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAudits} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Neu laden
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Kunde
            </Button>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="Suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="pausiert">Pausiert</SelectItem>
                  <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-muted-foreground">Daten konnten nicht geladen werden</p>
                <p className="text-xs text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={fetchAudits}>Erneut versuchen</Button>
              </div>
            ) : loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {([
                        ["customer_id", "Customer-ID"],
                        ["kunde_name", "Kunde"],
                        ["funnel_link", "Funnel"],
                        ["kampagnenstart", "Kampagnenstart"],
                        ["audit_fenster_start", "Audit-Start"],
                        ["audit_fenster_ende", "Audit-Ende"],
                        ["zustaendiger_tester", "Tester"],
                        ["tester_email", "Email"],
                        ["status", "Status"],
                        ["letztes_audit_datum", "Letztes Audit"],
                        ["naechstes_audit_datum", "Nächstes Audit"],
                        ["notizen", "Notizen"],
                      ] as [SortKey, string][]).map(([k, label]) => (
                        <TableHead key={k}>
                          <button
                            onClick={() => toggleSort(k)}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            {label}
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          </button>
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                          Keine Einträge
                        </TableCell>
                      </TableRow>
                    ) : filtered.map((a) => (
                      <TableRow key={a.customer_id}>
                        <TableCell className="font-mono text-xs">{a.customer_id}</TableCell>
                        <TableCell className="font-medium">{a.kunde_name}</TableCell>
                        <TableCell>
                          {a.funnel_link ? (
                            <a
                              href={a.funnel_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                            >
                              Link <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">{formatDate(a.kampagnenstart)}</TableCell>
                        <TableCell className="tabular-nums text-xs">{formatDate(a.audit_fenster_start)}</TableCell>
                        <TableCell className="tabular-nums text-xs">{formatDate(a.audit_fenster_ende)}</TableCell>
                        <TableCell className="text-xs">{a.zustaendiger_tester}</TableCell>
                        <TableCell className="text-xs">{a.tester_email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusVariant(a.status)}>
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">{formatDate(a.letztes_audit_datum)}</TableCell>
                        <TableCell className="tabular-nums text-xs">{formatDate(a.naechstes_audit_datum)}</TableCell>
                        <TableCell className="max-w-[200px]">
                          {a.notizen ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block truncate text-xs text-muted-foreground cursor-help">
                                  {a.notizen}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md whitespace-pre-wrap">
                                {a.notizen}
                              </TooltipContent>
                            </Tooltip>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(a)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Audit bearbeiten" : "Neuer Kunde"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <Field label="Customer-ID *">
                <Input value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} disabled={!!editing} />
              </Field>
              <Field label="Kunde *">
                <Input value={form.kunde_name} onChange={(e) => setForm({ ...form, kunde_name: e.target.value })} />
              </Field>
              <Field label="Funnel-Link" className="col-span-2">
                <Input value={form.funnel_link} onChange={(e) => setForm({ ...form, funnel_link: e.target.value })} placeholder="https://…" />
              </Field>
              <Field label="Kampagnenstart">
                <Input type="date" value={form.kampagnenstart} onChange={(e) => setForm({ ...form, kampagnenstart: e.target.value })} />
              </Field>
              <Field label="Status *">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="pausiert">Pausiert</SelectItem>
                    <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Audit-Fenster Start">
                <Input type="date" value={form.audit_fenster_start} onChange={(e) => setForm({ ...form, audit_fenster_start: e.target.value })} />
              </Field>
              <Field label="Audit-Fenster Ende">
                <Input type="date" value={form.audit_fenster_ende} onChange={(e) => setForm({ ...form, audit_fenster_ende: e.target.value })} />
              </Field>
              <Field label="Zuständiger Tester">
                <Input value={form.zustaendiger_tester} onChange={(e) => setForm({ ...form, zustaendiger_tester: e.target.value })} />
              </Field>
              <Field label="Tester Email">
                <Input type="email" value={form.tester_email} onChange={(e) => setForm({ ...form, tester_email: e.target.value })} />
              </Field>
              <Field label="Letztes Audit">
                <Input type="date" value={form.letztes_audit_datum ?? ""} onChange={(e) => setForm({ ...form, letztes_audit_datum: e.target.value || null })} />
              </Field>
              <Field label="Nächstes Audit">
                <Input type="date" value={form.naechstes_audit_datum ?? ""} onChange={(e) => setForm({ ...form, naechstes_audit_datum: e.target.value || null })} />
              </Field>
              <Field label="Notizen" className="col-span-2">
                <Textarea rows={4} value={form.notizen} onChange={(e) => setForm({ ...form, notizen: e.target.value })} />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Abbrechen</Button>
              <Button onClick={submitForm} disabled={saving}>
                {saving ? "Speichert…" : editing ? "Speichern" : "Anlegen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.kunde_name} ({deleteTarget?.customer_id}) wird permanent aus Google Sheets entfernt und kann nicht wiederhergestellt werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
