import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronRight, ArrowLeft, Bot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  params?: Array<{ name: string; type: string; required: boolean; desc: string }>;
  requestBody?: string;
  responseBody: string;
}

interface Section {
  id: string;
  title: string;
  icon: string;
  endpoints: Endpoint[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  POST: 'bg-green-500/15 text-green-600 dark:text-green-400',
  PATCH: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  DELETE: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const SECTIONS: Section[] = [
  {
    id: 'auth',
    title: 'Authentifizierung',
    icon: '🔐',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/auth/verify',
        description: 'Verifiziert den API Token und gibt die zugehörigen Scopes zurück.',
        responseBody: `{
  "valid": true,
  "scopes": ["read:all", "write:deals"],
  "expires_at": "2026-12-31T23:59:59Z"
}`,
      },
    ],
  },
  {
    id: 'deals',
    title: 'Deals',
    icon: '💼',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/deals',
        description: 'Alle Deals abrufen. Unterstützt Pagination und Filter.',
        params: [
          { name: 'page', type: 'number', required: false, desc: 'Seitennummer (Standard: 1)' },
          { name: 'per_page', type: 'number', required: false, desc: 'Einträge pro Seite (Standard: 20, Max: 100)' },
          { name: 'status', type: 'string', required: false, desc: 'Nach Status filtern' },
        ],
        responseBody: `{
  "data": [
    {
      "id": "uuid",
      "client_name": "Steven Rau",
      "art": "Beihilfe - PKV",
      "wert_eur": 4500,
      "status": "Aktiv",
      "ampelstatus": "Grün"
    }
  ],
  "count": 17,
  "page": 1,
  "per_page": 20,
  "error": null
}`,
      },
      {
        method: 'GET',
        path: '/v1/deals/:id',
        description: 'Einen Deal nach ID abrufen.',
        params: [{ name: 'id', type: 'uuid', required: true, desc: 'Deal ID' }],
        responseBody: `{
  "data": { "id": "uuid", "client_name": "Steven Rau", ... },
  "error": null
}`,
      },
      {
        method: 'POST',
        path: '/v1/deals',
        description: 'Neuen Deal erstellen. Benötigt Scope: write:deals.',
        requestBody: `{
  "client_name": "Neukunde GmbH",
  "wert_eur": 5000,
  "art": "PKV",
  "deal_type": "Neukunde",
  "laufzeit_monate": 12
}`,
        responseBody: `{
  "data": { "id": "uuid", "client_name": "Neukunde GmbH", ... },
  "error": null
}`,
      },
      {
        method: 'PATCH',
        path: '/v1/deals/:id',
        description: 'Deal aktualisieren. Benötigt Scope: write:deals.',
        requestBody: `{
  "status": "Won",
  "wert_eur": 6000
}`,
        responseBody: `{
  "data": { "id": "uuid", ... },
  "error": null
}`,
      },
      {
        method: 'PATCH',
        path: '/v1/deals/:id/ampel',
        description: 'Ampelstatus eines Deals ändern. Benötigt Scope: write:deals.',
        requestBody: `{ "ampelstatus": "Rot" }`,
        responseBody: `{
  "data": { "id": "uuid", "ampelstatus": "Rot", ... },
  "error": null
}`,
      },
    ],
  },
  {
    id: 'tasks',
    title: 'Aufgaben',
    icon: '✅',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/tasks',
        description: 'Alle Aufgaben abrufen.',
        params: [
          { name: 'status', type: 'string', required: false, desc: 'Offen, Erledigt, etc.' },
          { name: 'assignee_id', type: 'uuid', required: false, desc: 'Nach Mitarbeiter filtern' },
        ],
        responseBody: `{
  "data": [{ "id": "uuid", "title": "Briefing erstellen", "status": "Offen", ... }],
  "count": 5,
  "page": 1,
  "per_page": 20,
  "error": null
}`,
      },
      {
        method: 'POST',
        path: '/v1/tasks',
        description: 'Neue Aufgabe erstellen. Benötigt Scope: write:tasks.',
        requestBody: `{
  "title": "Landing Page prüfen",
  "assignee_id": "uuid",
  "due_date": "2026-04-15"
}`,
        responseBody: `{ "data": { "id": "uuid", ... }, "error": null }`,
      },
      {
        method: 'PATCH',
        path: '/v1/tasks/:id',
        description: 'Aufgabe aktualisieren.',
        requestBody: `{ "status": "Erledigt" }`,
        responseBody: `{ "data": { "id": "uuid", ... }, "error": null }`,
      },
      {
        method: 'DELETE',
        path: '/v1/tasks/:id',
        description: 'Aufgabe löschen. Benötigt Scope: write:tasks.',
        responseBody: `{ "success": true, "error": null }`,
      },
    ],
  },
  {
    id: 'invoices',
    title: 'Rechnungen',
    icon: '🧾',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/invoices',
        description: 'Alle Rechnungen abrufen.',
        params: [
          { name: 'status', type: 'string', required: false, desc: 'Entwurf, Gesendet, Bezahlt, Überfällig' },
        ],
        responseBody: `{
  "data": [{ "id": "uuid", "invoice_nr": "VC-2026-001", "brutto": 4165, "status": "Bezahlt", ... }],
  "count": 5,
  "page": 1,
  "per_page": 20,
  "error": null
}`,
      },
      {
        method: 'POST',
        path: '/v1/invoices',
        description: 'Rechnung erstellen. Benötigt Scope: write:invoices.',
        requestBody: `{
  "invoice_nr": "VC-2026-006",
  "client_name": "Neukunde GmbH",
  "netto": 3500,
  "mwst_rate": 19
}`,
        responseBody: `{ "data": { "id": "uuid", ... }, "error": null }`,
      },
      {
        method: 'PATCH',
        path: '/v1/invoices/:id/status',
        description: 'Rechnungsstatus ändern. Benötigt Scope: write:invoices.',
        requestBody: `{ "status": "Bezahlt" }`,
        responseBody: `{ "data": { "id": "uuid", "status": "Bezahlt", ... }, "error": null }`,
      },
    ],
  },
  {
    id: 'ad-budgets',
    title: 'Werbebudgets',
    icon: '💰',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/ad-budgets',
        description: 'Alle Werbebudgets abrufen. Filtert optional nach Kundenname.',
        params: [
          { name: 'name', type: 'string', required: false, desc: 'Kundenname (ILIKE Suche)' },
        ],
        responseBody: `{
  "data": [{
    "id": "uuid",
    "werbeaccount_name": "Haustierversichert",
    "name": "Sabine Liebscher",
    "werbebudget": 750,
    "ausgegeben": 756.23,
    "remaining": -6.23,
    "laufzeit": "3 Monate",
    "pausiert": true,
    "account_id": "act_1452387582635654"
  }],
  "count": 24,
  "error": null
}`,
      },
      {
        method: 'GET',
        path: '/v1/ad-budgets/:id',
        description: 'Ein Werbebudget nach ID abrufen.',
        params: [{ name: 'id', type: 'uuid', required: true, desc: 'Budget ID' }],
        responseBody: `{ "data": { ... }, "error": null }`,
      },
      {
        method: 'PATCH',
        path: '/v1/ad-budgets/:id/ausgegeben',
        description: 'Ausgaben eines Budgets aktualisieren (z.B. nach Meta Sync).',
        requestBody: `{ "ausgegeben": 812.50 }`,
        responseBody: `{
  "data": { "id": "uuid", "ausgegeben": 812.50, "sync_status": "synced", ... },
  "error": null
}`,
      },
      {
        method: 'POST',
        path: '/v1/ad-budgets/:id/sync',
        description: 'Meta Sync für ein Budget triggern.',
        responseBody: `{ "message": "Sync triggered", "budget_id": "uuid", "error": null }`,
      },
    ],
  },
  {
    id: 'aria',
    title: 'ARIA (KI-Assistent)',
    icon: '🤖',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/aria/message',
        description: 'Nachricht an ARIA senden. Optional mit Aktionsausführung.',
        requestBody: `{
  "message": "Starte die Zeiterfassung für Kunde Denis Petric",
  "execute_actions": true
}`,
        responseBody: `{
  "response": "Timer gestartet für Denis Petric ✓",
  "actions_executed": ["start_timer"],
  "action_results": [{"action": "start_timer", "success": true}],
  "error": null
}`,
      },
      {
        method: 'POST',
        path: '/v1/aria/automate',
        description: 'Eine gespeicherte ARIA-Automation per Name triggern.',
        requestBody: `{
  "automation_name": "Setter Tagesreport",
  "trigger": "manual"
}`,
        responseBody: `{
  "automation_id": "uuid",
  "name": "Setter Tagesreport",
  "triggered": true,
  "error": null
}`,
      },
    ],
  },
  {
    id: 'team',
    title: 'Team',
    icon: '👥',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/team',
        description: 'Alle Teammitglieder abrufen.',
        responseBody: `{
  "data": [{ "id": "uuid", "name": "Noah Mrosek", "rolle": "Admin", "department": "Management" }],
  "count": 17,
  "error": null
}`,
      },
      {
        method: 'GET',
        path: '/v1/sales-performance',
        description: 'Sales-Performance Daten abrufen.',
        params: [
          { name: 'period', type: 'string', required: false, desc: 'week | month (Standard: week)' },
        ],
        responseBody: `{
  "data": [{ "setter_id": "uuid", "datum": "2026-04-07", "calls_made": 45, "appointments_set": 3, ... }],
  "count": 7,
  "error": null
}`,
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Benachrichtigungen',
    icon: '🔔',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/notifications',
        description: 'Notification an einen Benutzer senden.',
        requestBody: `{
  "title": "Neuer Abschluss",
  "preview": "Steven Rau — 4.500 €",
  "channel": "system",
  "user_id": "uuid",
  "action_url": "/kunden/abschluesse",
  "tag": "deal"
}`,
        responseBody: `{ "data": { "id": "uuid", ... }, "error": null }`,
      },
    ],
  },
  {
    id: 'webhooks',
    title: 'Webhooks',
    icon: '🔗',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/webhooks',
        description: 'Webhook registrieren um auf Events zu reagieren.',
        requestBody: `{
  "url": "https://your-app.com/webhook",
  "events": ["deal.created", "task.updated", "invoice.paid"]
}`,
        responseBody: `{ "data": { "id": "uuid", "url": "...", "events": [...] }, "error": null }`,
      },
    ],
  },
  {
    id: 'errors',
    title: 'Fehler-Codes',
    icon: '⚠️',
    endpoints: [
      {
        method: 'GET',
        path: '(alle Endpunkte)',
        description: 'Standard-Fehlercodes die von der API zurückgegeben werden.',
        responseBody: `200 — Erfolg
201 — Erstellt
400 — Bad Request (ungültige Parameter)
401 — Unauthorized (ungültiger oder abgelaufener Token)
403 — Forbidden (fehlende Scopes)
404 — Not Found
405 — Method Not Allowed
429 — Rate Limit (max. 100 Requests/Minute)
500 — Serverfehler`,
      },
    ],
  },
];

const WEBHOOK_EVENTS = [
  { event: 'deal.created', desc: 'Neuer Deal wurde erstellt' },
  { event: 'deal.updated', desc: 'Deal wurde aktualisiert' },
  { event: 'deal.status_changed', desc: 'Deal-Status hat sich geändert' },
  { event: 'task.created', desc: 'Neue Aufgabe wurde erstellt' },
  { event: 'task.completed', desc: 'Aufgabe wurde abgeschlossen' },
  { event: 'task.overdue', desc: 'Aufgabe ist überfällig' },
  { event: 'invoice.created', desc: 'Neue Rechnung wurde erstellt' },
  { event: 'invoice.paid', desc: 'Rechnung wurde bezahlt' },
  { event: 'invoice.overdue', desc: 'Rechnung ist überfällig' },
  { event: 'budget.exceeded', desc: 'Werbebudget überschritten' },
  { event: 'budget.warning', desc: 'Werbebudget unter €200 verbleibend' },
  { event: 'client.ampel_changed', desc: 'Ampelstatus eines Kunden hat sich geändert' },
  { event: 'client.laufzeit_ending', desc: 'Kundenlaufzeit endet bald' },
  { event: 'team.member_joined', desc: 'Neues Teammitglied' },
  { event: 'team.member_approved', desc: 'Mitarbeiter wurde freigeschaltet' },
];

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-[#1D1D1F] dark:bg-[#111] text-gray-300 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre">
      {code}
    </pre>
  );
}

function EndpointBlock({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const BASE = 'https://api.haushhaush.de';

  const curlExample = `curl -X ${ep.method} ${BASE}${ep.path} \\
  -H "Authorization: Bearer ahd_..." \\
  -H "Content-Type: application/json"${ep.requestBody ? ` \\
  -d '${ep.requestBody.replace(/\n/g, '').replace(/\s+/g, ' ')}'` : ''}`;

  const jsExample = `const res = await fetch("${BASE}${ep.path}", {
  method: "${ep.method}",
  headers: {
    "Authorization": "Bearer ahd_...",
    "Content-Type": "application/json",
  },${ep.requestBody ? `\n  body: JSON.stringify(${ep.requestBody.replace(/\n/g, '').replace(/\s+/g, ' ')}),` : ''}
});
const data = await res.json();`;

  const pyExample = `import requests

res = requests.${ep.method.toLowerCase()}(
    "${BASE}${ep.path}",
    headers={"Authorization": "Bearer ahd_..."},${ep.requestBody ? `\n    json=${ep.requestBody.replace(/\n/g, '').replace(/\s+/g, ' ')},` : ''}
)
data = res.json()`;

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-app)] transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />}
        <Badge className={`${METHOD_COLORS[ep.method]} border-0 font-mono text-[10px] font-bold`}>
          {ep.method}
        </Badge>
        <span className="font-mono text-sm text-[var(--text-primary)]">{ep.path}</span>
        <span className="text-xs text-[var(--text-muted)] ml-auto hidden sm:block">{ep.description}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-4 space-y-4 bg-[var(--bg-app)]">
          <p className="text-sm text-[var(--text-secondary)]">{ep.description}</p>

          {ep.params && ep.params.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Parameter</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-1.5 text-[var(--text-muted)] font-medium">Name</th>
                      <th className="text-left py-1.5 text-[var(--text-muted)] font-medium">Typ</th>
                      <th className="text-left py-1.5 text-[var(--text-muted)] font-medium">Pflicht</th>
                      <th className="text-left py-1.5 text-[var(--text-muted)] font-medium">Beschreibung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.params.map(p => (
                      <tr key={p.name} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-1.5 font-mono text-[var(--text-primary)]">{p.name}</td>
                        <td className="py-1.5 text-[var(--text-muted)]">{p.type}</td>
                        <td className="py-1.5">{p.required ? '✓' : '—'}</td>
                        <td className="py-1.5 text-[var(--text-secondary)]">{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {ep.requestBody && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Request Body</p>
              <CodeBlock code={ep.requestBody} />
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Response</p>
            <CodeBlock code={ep.responseBody} />
          </div>

          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Beispiele</p>
            <Tabs defaultValue="curl">
              <TabsList className="h-8">
                <TabsTrigger value="curl" className="text-xs h-7">cURL</TabsTrigger>
                <TabsTrigger value="js" className="text-xs h-7">JavaScript</TabsTrigger>
                <TabsTrigger value="python" className="text-xs h-7">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="curl"><CodeBlock code={curlExample} /></TabsContent>
              <TabsContent value="js"><CodeBlock code={jsExample} /></TabsContent>
              <TabsContent value="python"><CodeBlock code={pyExample} /></TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApiDocs() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('auth');

  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-[220px] border-r border-[var(--border)] bg-[var(--bg-surface)] p-4 sticky top-0 h-screen overflow-y-auto">
          <button
            onClick={() => navigate('/einstellungen')}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-6 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zurück
          </button>
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4">API Dokumentation</h2>
          <nav className="space-y-0.5">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveSection(s.id);
                  document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  activeSection === s.id
                    ? 'bg-[var(--color-teal-subtle)] text-[var(--color-teal)] font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]'
                }`}
              >
                <span className="text-xs">{s.icon}</span>
                {s.title}
              </button>
            ))}
            <button
              onClick={() => {
                setActiveSection('webhook-events');
                document.getElementById('section-webhook-events')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                activeSection === 'webhook-events'
                  ? 'bg-[var(--color-teal-subtle)] text-[var(--color-teal)] font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]'
              }`}
            >
              <span className="text-xs">📡</span>
              Webhook Events
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-12">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Agency Hub API</h1>
            <p className="text-[var(--text-secondary)] mt-2">
              Verbinde jede App nahtlos mit deinem Dashboard. Nutze unsere REST API um Deals, Aufgaben, Rechnungen, Werbebudgets und mehr zu verwalten.
            </p>
            <Card className="mt-4 border-[var(--border)] bg-[var(--bg-surface)]">
              <CardContent className="p-4">
                <p className="text-xs text-[var(--text-muted)] mb-1">Base URL</p>
                <p className="font-mono text-sm text-[var(--text-primary)]">https://api.haushhaush.de/v1</p>
                <p className="text-xs text-[var(--text-muted)] mt-3 mb-1">Authentication Header</p>
                <p className="font-mono text-sm text-[var(--text-primary)]">Authorization: Bearer ahd_your_token_here</p>
              </CardContent>
            </Card>
          </div>

          {SECTIONS.map(section => (
            <section key={section.id} id={`section-${section.id}`} className="space-y-4">
              <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                <span>{section.icon}</span>
                {section.title}
              </h2>
              <div className="space-y-3">
                {section.endpoints.map((ep, i) => (
                  <EndpointBlock key={i} ep={ep} />
                ))}
              </div>
            </section>
          ))}

          {/* Webhook Events */}
          <section id="section-webhook-events" className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span>📡</span>
              Webhook Events
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Liste aller Events die von der API emitted werden können.
            </p>
            <Card className="border-[var(--border)] bg-[var(--bg-surface)]">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left px-4 py-2.5 text-xs text-[var(--text-muted)] font-medium">Event</th>
                        <th className="text-left px-4 py-2.5 text-xs text-[var(--text-muted)] font-medium">Beschreibung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {WEBHOOK_EVENTS.map(e => (
                        <tr key={e.event} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-4 py-2 font-mono text-xs text-[var(--text-primary)]">{e.event}</td>
                          <td className="px-4 py-2 text-xs text-[var(--text-secondary)]">{e.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ARIA Guide Card */}
          <section className="space-y-4">
            <Card className="border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-teal)]/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-[var(--color-teal)]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">Steuere das Portal per ARIA</h3>
                    <p className="text-xs text-[var(--text-muted)]">ARIA kann alle API-Endpunkte direkt ausführen — kein API Key nötig.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { prompt: 'zeig mir alle offenen Rechnungen', api: 'GET /invoices?status=offen' },
                    { prompt: 'erstelle eine Aufgabe für Justin: Rechnung Kehlenbach klären', api: 'POST /tasks {"title": "Rechnung Kehlenbach klären", ...}' },
                    { prompt: 'wie viel hat Matthias Grimske ausgegeben?', api: 'GET /ad-budgets?name=Mathias+Grimske' },
                    { prompt: 'pausiere den Timer', api: 'PATCH /timer/stop' },
                  ].map((ex, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 bg-[var(--bg-app)] rounded-lg px-4 py-2.5">
                      <span className="text-sm text-[var(--text-primary)]">"{ex.prompt}"</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] sm:ml-auto">→ {ex.api}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
