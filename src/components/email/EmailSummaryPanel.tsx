import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Settings2, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  classifyEmail,
  groupSimilarEmails,
  calculateTimeSaved,
  DEFAULT_RULES,
  type ClassifierRules,
} from '@/lib/email-classifier';
import { formatEmailDate } from '@/lib/email/folders';
import { EmailRulesModal } from './EmailRulesModal';

const STORAGE_KEY = 'email-classifier-rules';

function loadRules(): ClassifierRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RULES;
    const parsed = JSON.parse(raw);
    return {
      importantSenders: parsed.importantSenders ?? [],
      importantKeywords: parsed.importantKeywords ?? [],
      ignorableSenders: parsed.ignorableSenders ?? [],
      ignorableKeywords: parsed.ignorableKeywords ?? [],
    };
  } catch {
    return DEFAULT_RULES;
  }
}

type CountFilter = 10 | 20 | 50 | 'today' | '7days';

const COUNT_LABELS: Record<string, string> = {
  '10': 'Letzte 10',
  '20': 'Letzte 20',
  '50': 'Letzte 50',
  today: 'Heute',
  '7days': 'Letzte 7 Tage',
};

interface Props {
  open: boolean;
  onClose: () => void;
  messages: any[];
  onSelectEmail: (uid: number) => void;
}

export function EmailSummaryPanel({ open, onClose, messages, onSelectEmail }: Props) {
  const [rules, setRules] = useState<ClassifierRules>(() => loadRules());
  const [filterCount, setFilterCount] = useState<CountFilter>(20);
  const [filterUnread, setFilterUnread] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Re-load rules when storage changes (e.g. after editing in modal)
  useEffect(() => {
    if (open) setRules(loadRules());
  }, [open, rulesOpen]);

  const summary = useMemo(() => {
    if (!messages || messages.length === 0) return null;

    let toClassify = [...messages];
    if (filterUnread) {
      toClassify = toClassify.filter((m) => !m.flags?.includes('\\Seen'));
    }

    if (filterCount === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      toClassify = toClassify.filter((m) => m.date && new Date(m.date) >= startOfDay);
    } else if (filterCount === '7days') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      toClassify = toClassify.filter((m) => m.date && new Date(m.date) >= cutoff);
    } else {
      toClassify = toClassify.slice(0, filterCount);
    }

    const classified = toClassify.map((email) => classifyEmail(email, rules));
    const grouped = groupSimilarEmails(classified);
    const ignorableCount = grouped.ignorable.reduce((s, g) => s + g.count, 0);

    return {
      total: toClassify.length,
      grouped,
      ignorableCount,
      timeSaved: calculateTimeSaved(ignorableCount, toClassify.length),
    };
  }, [messages, filterCount, filterUnread, rules]);

  const handleSelect = (uid: number) => {
    onSelectEmail(uid);
    onClose();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none sm:w-[50vw] overflow-y-auto p-0"
        >
          <div className="p-6 space-y-5">
            <SheetHeader>
              <SheetTitle className="text-2xl">📊 Zusammenfassung</SheetTitle>
              <SheetDescription>
                Klassifiziert deine letzten E-Mails nach Wichtigkeit
              </SheetDescription>
            </SheetHeader>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Anzahl:</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      {COUNT_LABELS[String(filterCount)]}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {([10, 20, 50, 'today', '7days'] as CountFilter[]).map((opt) => (
                      <DropdownMenuItem key={String(opt)} onClick={() => setFilterCount(opt)}>
                        {COUNT_LABELS[String(opt)]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Filter:</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      {filterUnread ? 'Nur ungelesen' : 'Alle'}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setFilterUnread(false)}>Alle</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterUnread(true)}>Nur ungelesen</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Empty state */}
            {(!summary || summary.total === 0) && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
                Keine E-Mails zum Analysieren
              </div>
            )}

            {summary && summary.total > 0 && (
              <>
                {/* Stats banner */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-sm font-semibold">
                        {summary.total} E-Mails analysiert
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ⏱️ ca. {summary.timeSaved} Min Lesezeit gespart
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
                        {summary.grouped.important.length} wichtig
                      </span>
                      <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                        {summary.grouped.informational.length} Info
                      </span>
                      <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground font-medium">
                        {summary.ignorableCount} Routine
                      </span>
                    </div>
                  </div>
                </div>

                {/* Important */}
                {summary.grouped.important.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">
                      🔥 Wichtig — Aufmerksamkeit nötig ({summary.grouped.important.length})
                    </div>
                    <div className="space-y-2">
                      {summary.grouped.important.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelect(c.email.uid)}
                          className="w-full text-left border-l-4 border-red-500 pl-3 py-2 bg-red-500/5 hover:bg-red-500/10 rounded-r transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">
                              {c.email.from_name || c.email.from_address}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatEmailDate(c.email.date)}
                            </span>
                          </div>
                          <div className="text-sm truncate">{c.email.subject || '(kein Betreff)'}</div>
                          {c.reasons.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {c.reasons.slice(0, 2).join(' · ')}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Informational */}
                {summary.grouped.informational.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">
                      📬 Information ({summary.grouped.informational.length})
                    </div>
                    <div className="space-y-1">
                      {summary.grouped.informational.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelect(c.email.uid)}
                          className="w-full text-left text-sm hover:bg-muted/60 px-2 py-1.5 rounded flex justify-between gap-3 transition-colors"
                        >
                          <span className="truncate flex-1 min-w-0">
                            <span className="font-medium">
                              {c.email.from_name || c.email.from_address}:
                            </span>{' '}
                            <span className="text-muted-foreground">
                              {c.email.subject || '(kein Betreff)'}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatEmailDate(c.email.date)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ignorable */}
                {summary.grouped.ignorable.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground">
                      ⏭️ Routine / Ignorierbar ({summary.ignorableCount})
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {summary.grouped.ignorable.map((g, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40"
                        >
                          <span className="truncate flex-1 min-w-0">
                            <span className="font-medium">{g.sender}:</span>{' '}
                            {g.subject_pattern || '(kein Betreff)'}
                          </span>
                          {g.count > 1 && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                              {g.count}×
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Settings link */}
                <div className="pt-4 border-t border-border text-xs text-muted-foreground">
                  <button
                    onClick={() => setRulesOpen(true)}
                    className="inline-flex items-center gap-1 hover:text-primary underline-offset-2 hover:underline transition-colors"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Klassifizierungs-Regeln anpassen
                  </button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <EmailRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        onSaved={(newRules) => setRules(newRules)}
      />
    </>
  );
}
