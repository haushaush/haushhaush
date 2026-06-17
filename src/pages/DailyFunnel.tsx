import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Plus, X, Check, Star, Sparkles, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getFunnelType } from '@/hooks/useFunnelGuard';

type Priority = 'muss' | 'soll' | 'kann';
type Ziel = { text: string; prioritaet: Priority; done?: boolean; status?: 'done' | 'half' | 'open'; carried_over?: boolean };
type Zusage = { text: string; done?: boolean; status?: 'done' | 'half' | 'open'; carried_over?: boolean };

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const yesterdayISO = () => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const energieEmoji = (n: number) => (n <= 3 ? '😴' : n <= 4 ? '😐' : n <= 7 ? '🙂' : '🔥');
const PRIO_META: Record<Priority, { label: string; dot: string; bg: string }> = {
  muss: { label: '🔴 Muss', dot: 'bg-red-500', bg: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30' },
  soll: { label: '🟡 Soll', dot: 'bg-amber-500', bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  kann: { label: '🟢 Kann', dot: 'bg-emerald-500', bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
};

export default function DailyFunnel() {
  const { user, isTestMode } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const firstName = profile?.name?.split(' ')[0] || profile?.name || '';

  const initialType = getFunnelType();
  const [type, setType] = useState<'checkin' | 'checkout'>(initialType);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [summaryMode, setSummaryMode] = useState(false);

  // Checkin state
  const [ziele, setZiele] = useState<Ziel[]>([]);
  const [focusTask, setFocusTask] = useState('');
  const [zusagen, setZusagen] = useState<Zusage[]>([]);
  const [energieMorgen, setEnergieMorgen] = useState<number>(7);
  const [vorfreude, setVorfreude] = useState('');

  // Checkout state
  const [zieleAbend, setZieleAbend] = useState<Ziel[]>([]);
  const [zusagenAbend, setZusagenAbend] = useState<Zusage[]>([]);
  const [energieAbend, setEnergieAbend] = useState<number>(7);
  const [learnings, setLearnings] = useState('');
  const [tagesbewertung, setTagesbewertung] = useState<number>(0);
  const [notiz, setNotiz] = useState('');

  useEffect(() => {
    if (!user || isTestMode) { setLoading(false); return; }
    (async () => {
      // Existing today?
      const { data: todays } = await supabase
        .from('daily_checkins').select('*')
        .eq('user_id', user.id).eq('date', todayISO());

      const checkin = todays?.find((r: any) => r.type === 'checkin');
      const checkout = todays?.find((r: any) => r.type === 'checkout');

      if (type === 'checkin' && checkin) {
        setExistingId(checkin.id);
        setZiele((checkin.ziele as Ziel[]) || []);
        setFocusTask(checkin.focus_task || '');
        setZusagen((checkin.zusagen as Zusage[]) || []);
        setEnergieMorgen(checkin.energie_morgen || 7);
        setVorfreude(checkin.vorfreude || '');
        setSummaryMode(true);
      } else if (type === 'checkout' && checkout) {
        setExistingId(checkout.id);
        setZieleAbend((checkout.ziele_abend as Ziel[]) || []);
        setZusagenAbend((checkout.zusagen_abend as Zusage[]) || []);
        setEnergieAbend(checkout.energie_abend || 7);
        setLearnings(checkout.learnings || '');
        setTagesbewertung(checkout.tagesbewertung || 0);
        setNotiz(checkout.notiz || '');
        setSummaryMode(true);
      }

      if (type === 'checkin') {
        // Load carried-over from yesterday's checkout
        const { data: y } = await supabase
          .from('daily_checkins').select('*')
          .eq('user_id', user.id).eq('date', yesterdayISO()).eq('type', 'checkout').maybeSingle();
        if (y && !checkin) {
          const ziel = (y.ziele_abend as Ziel[]) || [];
          const zus = (y.zusagen_abend as Zusage[]) || [];
          const carried = ziel.filter(z => z.status !== 'done').map(z => ({ ...z, status: 'open' as const, done: false, carried_over: true }));
          const carriedZ = zus.filter(z => z.status !== 'done').map(z => ({ ...z, status: 'open' as const, done: false, carried_over: true }));
          if (carried.length) setZiele(carried);
          if (carriedZ.length) setZusagen(carriedZ);
        }
      }

      if (type === 'checkout') {
        // Load today's checkin so user reviews their commitments
        if (checkin && !checkout) {
          const cz = (checkin.ziele as Ziel[]) || [];
          const cZus = (checkin.zusagen as Zusage[]) || [];
          setZieleAbend(cz.map(z => ({ ...z, status: 'open' as const })));
          setZusagenAbend(cZus.map(z => ({ ...z, status: 'open' as const })));
          setEnergieAbend(checkin.energie_morgen || 7);
        }
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, type]);

  const totalSteps = 6;
  const progress = ((step + 1) / totalSteps) * 100;

  const addZiel = () => {
    if (ziele.length >= 5) { toast.warning('Mehr als 3 Hauptziele sind selten realistisch.'); }
    setZiele([...ziele, { text: '', prioritaet: 'soll' }]);
  };
  const addZusage = () => setZusagen([...zusagen, { text: '' }]);

  const saveCheckin = async () => {
    if (!user) return;
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      team_member_id: user.id,
      date: todayISO(),
      type: 'checkin',
      ziele: ziele.filter(z => z.text.trim()),
      focus_task: focusTask.trim() || null,
      zusagen: zusagen.filter(z => z.text.trim()),
      energie_morgen: energieMorgen,
      vorfreude: vorfreude.trim() || null,
    };
    const { error } = await supabase.from('daily_checkins').upsert(payload, { onConflict: 'user_id,date,type' });
    setSaving(false);
    if (error) { toast.error('Speichern fehlgeschlagen: ' + error.message); return; }
    toast.success('Tag gestartet 🚀');
    navigate('/');
  };

  const saveCheckout = async () => {
    if (!user) return;
    setSaving(true);
    // Mark not-done items as carried_over
    const zielMarked = zieleAbend.map(z => ({ ...z, done: z.status === 'done', carried_over: z.status !== 'done' }));
    const zusMarked = zusagenAbend.map(z => ({ ...z, done: z.status === 'done', carried_over: z.status !== 'done' }));
    const payload: any = {
      user_id: user.id,
      team_member_id: user.id,
      date: todayISO(),
      type: 'checkout',
      ziele_abend: zielMarked,
      zusagen_abend: zusMarked,
      energie_abend: energieAbend,
      learnings: learnings.trim() || null,
      tagesbewertung: tagesbewertung || null,
      notiz: notiz.trim() || null,
    };
    const { error } = await supabase.from('daily_checkins').upsert(payload, { onConflict: 'user_id,date,type' });
    setSaving(false);
    if (error) { toast.error('Speichern fehlgeschlagen: ' + error.message); return; }
    toast.success('Tag abgeschlossen ✓');
    navigate('/');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Lädt…</div>;
  }

  if (summaryMode) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-[600px] p-8">
          <div className="flex items-center gap-3 mb-6">
            {type === 'checkin' ? <Sun className="h-6 w-6 text-amber-500" /> : <Moon className="h-6 w-6 text-primary" />}
            <div>
              <h1 className="text-2xl font-bold">{type === 'checkin' ? 'Check-in' : 'Check-out'} für heute ist erledigt ✓</h1>
              <p className="text-sm text-muted-foreground">Du kannst die Antworten unten anpassen oder weitermachen.</p>
            </div>
          </div>
          {type === 'checkin' ? (
            <div className="space-y-4 text-sm">
              <div><span className="text-muted-foreground">Focus Task: </span><span className="font-medium">{focusTask || '–'}</span></div>
              <div><span className="text-muted-foreground">Energie: </span><span className="font-medium">{energieMorgen}/10 {energieEmoji(energieMorgen)}</span></div>
              <div>
                <p className="text-muted-foreground mb-1">Ziele:</p>
                <ul className="space-y-1">{ziele.map((z, i) => <li key={i}>• {z.text} <Badge variant="outline" className={cn('ml-1 text-[10px]', PRIO_META[z.prioritaet]?.bg)}>{PRIO_META[z.prioritaet]?.label}</Badge></li>)}</ul>
              </div>
              {!!zusagen.length && (
                <div>
                  <p className="text-muted-foreground mb-1">Zusagen:</p>
                  <ul className="space-y-1">{zusagen.map((z, i) => <li key={i}>• {z.text}</li>)}</ul>
                </div>
              )}
              {vorfreude && <div><span className="text-muted-foreground">Vorfreude: </span>{vorfreude}</div>}
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div><span className="text-muted-foreground">Tagesbewertung: </span><span className="font-medium">{tagesbewertung}/5 ⭐</span></div>
              <div><span className="text-muted-foreground">Energie Abend: </span><span className="font-medium">{energieAbend}/10 {energieEmoji(energieAbend)}</span></div>
              {learnings && <div><span className="text-muted-foreground">Learnings: </span>{learnings}</div>}
              {notiz && <div><span className="text-muted-foreground">Notiz: </span>{notiz}</div>}
            </div>
          )}
          <div className="flex gap-3 mt-8">
            <Button variant="outline" onClick={() => navigate('/')} className="flex-1">Zum Dashboard</Button>
            <Button onClick={() => { setSummaryMode(false); setStep(0); }} className="flex-1">Bearbeiten</Button>
            {type === 'checkin' && new Date().getHours() >= 11 && (
              <Button variant="secondary" onClick={() => { setType('checkout'); setSummaryMode(false); setStep(0); }} className="flex-1">Check-out starten</Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const renderCheckinStep = () => {
    switch (step) {
      case 0: {
        const carried = ziele.filter(z => z.carried_over);
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold mb-1">Guten Morgen{firstName ? `, ${firstName}` : ''} ☀️</h2>
              <p className="text-muted-foreground">{carried.length ? 'Vom Vortag übernommen — was nimmst du mit?' : 'Frischer Tag, keine offenen Punkte. Los geht\'s!'}</p>
            </div>
            {carried.length ? (
              <div className="space-y-2">
                {carried.map((z, i) => {
                  const idx = ziele.indexOf(z);
                  return (
                    <div key={i} className="flex items-center gap-2 bg-muted/40 border border-dashed border-border rounded-lg p-3">
                      <Badge variant="outline" className="text-[10px]">Vom Vortag</Badge>
                      <span className="flex-1 text-sm">{z.text}</span>
                      <Button variant="ghost" size="icon" onClick={() => setZiele(ziele.filter((_, j) => j !== idx))}><X className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground"><Sparkles className="h-10 w-10 mx-auto mb-2 text-primary/60" />Sauberer Start.</div>
            )}
          </div>
        );
      }
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold mb-1">Was sind deine 3 Hauptziele heute?</h2>
              <p className="text-muted-foreground">Fokus auf das, was wirklich zählt.</p>
            </div>
            <div className="space-y-3">
              {ziele.map((z, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                  <Input value={z.text} onChange={e => setZiele(ziele.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} placeholder="Ziel beschreiben…" className="flex-1" />
                  <div className="flex gap-1">
                    {(['muss','soll','kann'] as Priority[]).map(p => (
                      <button key={p} onClick={() => setZiele(ziele.map((x, j) => j === i ? { ...x, prioritaet: p } : x))}
                        className={cn('px-2 py-1 rounded text-xs border transition', z.prioritaet === p ? PRIO_META[p].bg : 'border-border text-muted-foreground hover:bg-muted')}>
                        {PRIO_META[p].label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setZiele(ziele.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addZiel}><Plus className="h-4 w-4 mr-1" /> Ziel hinzufügen</Button>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-1">Das EINE Ding</h2>
            <p className="text-muted-foreground">Was macht heute alles andere unwichtig?</p>
            <div className="bg-primary/10 border-2 border-primary/40 rounded-xl p-1">
              <Input value={focusTask} onChange={e => setFocusTask(e.target.value)} placeholder="Focus Task…" className="border-0 bg-transparent text-lg font-medium focus-visible:ring-0" />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Welche Energie hast du heute?</h2>
              <p className="text-muted-foreground">Sei ehrlich — das hilft dir, dich besser zu kennen.</p>
            </div>
            <div className="text-center">
              <div className="text-7xl mb-2">{energieEmoji(energieMorgen)}</div>
              <div className="text-4xl font-bold text-primary tabular-nums">{energieMorgen}<span className="text-lg text-muted-foreground">/10</span></div>
            </div>
            <Slider value={[energieMorgen]} onValueChange={v => setEnergieMorgen(v[0])} min={1} max={10} step={1} />
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-1">Worauf freust du dich heute?</h2>
            <p className="text-muted-foreground">Ein kleiner Anker für den Tag.</p>
            <Textarea value={vorfreude} onChange={e => setVorfreude(e.target.value)} placeholder="z.B. Kundencall, Mittagessen, Feierabend…" rows={3} />
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold mb-1">Welche Zusagen hast du heute?</h2>
              <p className="text-muted-foreground">Termine, Versprechen, Deadlines.</p>
            </div>
            <div className="space-y-2">
              {zusagen.map((z, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={z.text} onChange={e => setZusagen(zusagen.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} placeholder="z.B. Call mit Kunde X um 14 Uhr" className="flex-1" />
                  <Button variant="ghost" size="icon" onClick={() => setZusagen(zusagen.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addZusage}><Plus className="h-4 w-4 mr-1" /> Zusage hinzufügen</Button>
            </div>
          </div>
        );
    }
  };

  const renderCheckoutStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold mb-1">Wie war dein Tag, {firstName || 'du'}?</h2>
              <p className="text-muted-foreground">Eine ehrliche Bewertung.</p>
            </div>
            <div className="flex justify-center gap-2 py-4">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setTagesbewertung(n)} className="p-1 transition-transform hover:scale-110">
                  <Star className={cn('h-12 w-12', tagesbewertung >= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">{tagesbewertung ? `${tagesbewertung} von 5` : 'Tippe einen Stern'}</p>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-1">Deine Ziele von heute</h2>
            <p className="text-muted-foreground">Was hast du erledigt?</p>
            {zieleAbend.length === 0 && <p className="text-sm text-muted-foreground italic">Keine Ziele gesetzt heute Morgen.</p>}
            <div className="space-y-2">
              {zieleAbend.map((z, i) => (
                <div key={i} className="flex items-center gap-2 border border-border rounded-lg p-3">
                  <span className="flex-1 text-sm">{z.text}</span>
                  <div className="flex gap-1">
                    {([['done','✅'],['half','🔄'],['open','❌']] as const).map(([s, e]) => (
                      <button key={s} onClick={() => setZieleAbend(zieleAbend.map((x, j) => j === i ? { ...x, status: s as any } : x))}
                        className={cn('px-2 py-1 rounded text-sm border transition', z.status === s ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted')}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-1">Deine Zusagen von heute</h2>
            <p className="text-muted-foreground">Hast du dein Wort gehalten?</p>
            {zusagenAbend.length === 0 && <p className="text-sm text-muted-foreground italic">Keine Zusagen heute Morgen.</p>}
            <div className="space-y-2">
              {zusagenAbend.map((z, i) => (
                <div key={i} className="flex items-center gap-2 border border-border rounded-lg p-3">
                  <span className="flex-1 text-sm">{z.text}</span>
                  <div className="flex gap-1">
                    {([['done','✅'],['half','🔄'],['open','❌']] as const).map(([s, e]) => (
                      <button key={s} onClick={() => setZusagenAbend(zusagenAbend.map((x, j) => j === i ? { ...x, status: s as any } : x))}
                        className={cn('px-2 py-1 rounded text-sm border transition', z.status === s ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted')}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Wie war deine Energie heute Abend?</h2>
              <p className="text-muted-foreground">Wo stehst du gerade?</p>
            </div>
            <div className="text-center">
              <div className="text-7xl mb-2">{energieEmoji(energieAbend)}</div>
              <div className="text-4xl font-bold text-primary tabular-nums">{energieAbend}<span className="text-lg text-muted-foreground">/10</span></div>
            </div>
            <Slider value={[energieAbend]} onValueChange={v => setEnergieAbend(v[0])} min={1} max={10} step={1} />
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-1">Was hast du heute gelernt?</h2>
            <p className="text-muted-foreground">Ein Satz reicht.</p>
            <Textarea value={learnings} onChange={e => setLearnings(e.target.value)} placeholder="Ein Satz reicht…" rows={3} />
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-1">Notizen / Reflexion</h2>
            <p className="text-muted-foreground">Optional — alles, was raus muss.</p>
            <Textarea value={notiz} onChange={e => setNotiz(e.target.value)} placeholder="Gedanken, Erkenntnisse, To-Dos für morgen…" rows={5} />
          </div>
        );
    }
  };

  const isLast = step === totalSteps - 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-[600px]">
        {/* Mode toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button onClick={() => { setType('checkin'); setStep(0); }}
              className={cn('px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition', type === 'checkin' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
              <Sun className="h-3.5 w-3.5" /> Check-in
            </button>
            <button onClick={() => { setType('checkout'); setStep(0); }}
              className={cn('px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition', type === 'checkout' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
              <Moon className="h-3.5 w-3.5" /> Check-out
            </button>
          </div>
          <button onClick={() => navigate('/')} className="text-xs text-muted-foreground hover:text-foreground">Später</button>
        </div>

        {/* Progress */}
        <div className="h-1 bg-muted rounded-full mb-6 overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <Card className="p-6 sm:p-8 min-h-[420px] flex flex-col">
          <div className="flex-1">
            {type === 'checkin' ? renderCheckinStep() : renderCheckoutStep()}
          </div>

          <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
            <Button variant="ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">{step + 1} / {totalSteps}</span>
            {isLast ? (
              <Button onClick={type === 'checkin' ? saveCheckin : saveCheckout} disabled={saving} className="bg-primary">
                <Check className="h-4 w-4 mr-1" /> {type === 'checkin' ? 'Tag starten 🚀' : 'Tag abschließen ✓'}
              </Button>
            ) : (
              <Button onClick={() => setStep(s => Math.min(totalSteps - 1, s + 1))}>
                Weiter <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
