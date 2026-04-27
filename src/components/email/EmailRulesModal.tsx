import { useEffect, useState, KeyboardEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, RotateCcw } from 'lucide-react';
import { DEFAULT_RULES, type ClassifierRules } from '@/lib/email-classifier';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'email-classifier-rules';

type RuleKey = keyof ClassifierRules;

const SECTIONS: { key: RuleKey; title: string; placeholder: string; hint: string }[] = [
  {
    key: 'importantSenders',
    title: 'Wichtige Absender',
    placeholder: 'z. B. @kunde.de oder rechnung@',
    hint: 'Substring-Match auf der Absender-Adresse',
  },
  {
    key: 'importantKeywords',
    title: 'Wichtige Schlüsselwörter',
    placeholder: 'z. B. rechnung, vertrag',
    hint: 'Substring-Match im Betreff',
  },
  {
    key: 'ignorableSenders',
    title: 'Auto-Mail Absender (ignorieren)',
    placeholder: 'z. B. noreply@ oder @newsletter.de',
    hint: 'Diese Absender werden als Routine eingestuft',
  },
  {
    key: 'ignorableKeywords',
    title: 'Routine-Schlüsselwörter (ignorieren)',
    placeholder: 'z. B. login code, newsletter',
    hint: 'Diese Begriffe im Betreff senken die Wichtigkeit',
  },
];

function loadRules(): ClassifierRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RULES };
    const parsed = JSON.parse(raw);
    return {
      importantSenders: parsed.importantSenders ?? [],
      importantKeywords: parsed.importantKeywords ?? [],
      ignorableSenders: parsed.ignorableSenders ?? [],
      ignorableKeywords: parsed.ignorableKeywords ?? [],
    };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (rules: ClassifierRules) => void;
}

export function EmailRulesModal({ open, onClose, onSaved }: Props) {
  const [rules, setRules] = useState<ClassifierRules>(() => loadRules());
  const [drafts, setDrafts] = useState<Record<RuleKey, string>>({
    importantSenders: '',
    importantKeywords: '',
    ignorableSenders: '',
    ignorableKeywords: '',
  });

  useEffect(() => {
    if (open) setRules(loadRules());
  }, [open]);

  const persist = (next: ClassifierRules) => {
    setRules(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    onSaved(next);
  };

  const addTag = (key: RuleKey) => {
    const value = drafts[key].trim();
    if (value.length < 2) return;
    if (rules[key].includes(value)) {
      setDrafts((d) => ({ ...d, [key]: '' }));
      return;
    }
    persist({ ...rules, [key]: [...rules[key], value] });
    setDrafts((d) => ({ ...d, [key]: '' }));
  };

  const removeTag = (key: RuleKey, tag: string) => {
    persist({ ...rules, [key]: rules[key].filter((t) => t !== tag) });
  };

  const resetSection = (key: RuleKey) => {
    persist({ ...rules, [key]: [...DEFAULT_RULES[key]] });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, key: RuleKey) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(key);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Klassifizierungs-Regeln</DialogTitle>
          <DialogDescription>
            Passe an, was als wichtig oder ignorierbar gilt. Änderungen werden lokal gespeichert und
            sofort angewendet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {SECTIONS.map((section) => {
            const tags = rules[section.key];
            return (
              <div key={section.key} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{section.title}</div>
                    <div className="text-xs text-muted-foreground">{section.hint}</div>
                  </div>
                  <button
                    onClick={() => resetSection(section.key)}
                    className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Standard
                  </button>
                </div>

                <div
                  className={cn(
                    'flex flex-wrap gap-1.5 p-2 rounded-md border border-border bg-muted/20 min-h-[42px]',
                    tags.length === 0 && 'items-center',
                  )}
                >
                  {tags.length === 0 && (
                    <span className="text-xs text-muted-foreground italic px-1">Keine Einträge</span>
                  )}
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background border border-border text-xs"
                    >
                      {tag}
                      <button
                        onClick={() => removeTag(section.key, tag)}
                        className="hover:text-destructive"
                        aria-label={`${tag} entfernen`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    value={drafts[section.key]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [section.key]: e.target.value }))}
                    onKeyDown={(e) => onKey(e, section.key)}
                    placeholder={section.placeholder}
                    className="h-9"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addTag(section.key)}
                    className="gap-1 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Hinzufügen
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button onClick={onClose}>Fertig</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
