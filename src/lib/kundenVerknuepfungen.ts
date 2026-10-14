import { supabase } from '@/integrations/supabase/client';

/** Alle externen Systeme eines Kunden — eine Quelle für Tab, Kacheln und Sammelansicht. */
/** Slack und Pipedrive werden nicht auf Kundenebene verknüpft. */
export type SystemKey = 'close' | 'meta' | 'qonto' | 'onepage' | 'drive' | 'superchat';

export const SYSTEME: { key: SystemKey; label: string; objekt: string; angebunden: boolean }[] = [
  { key: 'close', label: 'Close', objekt: 'Lead', angebunden: true },
  { key: 'meta', label: 'Meta Ads', objekt: 'Werbekonto', angebunden: true },
  { key: 'qonto', label: 'Qonto', objekt: 'Gegenpartei', angebunden: true },
  { key: 'onepage', label: 'Onepage', objekt: 'Website', angebunden: true },
  { key: 'drive', label: 'Google Drive', objekt: 'Ordner', angebunden: true },
  { key: 'superchat', label: 'Superchat', objekt: 'Kontakt', angebunden: false },
];

export interface Objekt { id: string; name: string | null; url?: string | null; ref?: string; detail?: string }
export interface Vorschlag extends Objekt { system: SystemKey; grund: string }
export type SystemStand =
  | { zustand: 'verknuepft'; objekt: Objekt }
  | { zustand: 'vorschlag'; vorschlag: Vorschlag }
  | { zustand: 'offen' }
  | { zustand: 'nicht_angebunden' }
  | { zustand: 'keine_berechtigung' };

export interface KundeMin { id: string; name: string | null; vor_nachname?: string | null; email?: string | null; website_url?: string | null; website?: string | null }

// ---------- Abgleich ----------
const STOP = new Set(['gmbh', 'ug', 'ag', 'kg', 'ohg', 'gbr', 'mbh', 'co', 'und', 'the', 'der', 'die', 'das', 'von', 'haftungsbeschraenkt', 'ek', 'inh']);
const norm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s: string | null | undefined) => new Set(norm(s || '').split(' ').filter(t => t.length >= 3 && !STOP.has(t)));
/** Anteil gemeinsamer Wörter (bezogen auf den kürzeren Namen); verlangt mindestens ein Wort mit 4+ Zeichen. */
export function namensTreffer(a: string | null | undefined, b: string | null | undefined): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  const shared = [...A].filter(t => B.has(t));
  if (!shared.some(t => t.length >= 4)) return 0;
  const score = shared.length / Math.min(A.size, B.size);
  // Seltener, langer Nachname/Firmenname (z.B. „Koyuncu“) trägt den Treffer auch bei abweichender Vornamen-Schreibweise.
  return shared.some(t => t.length >= 6) && score >= 0.5 ? Math.max(score, 0.6) : score;
}
const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'web.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 't-online.de', 'me.com', 'aol.com', 'freenet.de', 'live.de', 'mail.de']);
export const domainVon = (raw: unknown): string | null => {
  const s = Array.isArray(raw) ? raw.find(x => typeof x === 'string') : raw;
  if (!s || typeof s !== 'string') return null;
  const v = s.includes('@') ? s.split('@')[1] : s.replace(/^https?:\/\//i, '').split('/')[0];
  const d = v.toLowerCase().replace(/^www\./, '').trim();
  return d && d.includes('.') && !FREEMAIL.has(d) ? d : null;
};

/** Findet den besten Namens-Treffer und nennt, worüber er kam. */
function besterName<T>(k: KundeMin, kandidaten: T[], name: (t: T) => string | null | undefined): { item: T; grund: string } | null {
  let best: { item: T; grund: string; score: number } | null = null;
  for (const c of kandidaten) {
    const n = name(c);
    const s1 = namensTreffer(k.name, n), s2 = namensTreffer(k.vor_nachname, n);
    const score = Math.max(s1, s2);
    if (score >= 0.6 && (!best || score > best.score)) {
      best = { item: c, score, grund: s1 >= s2 ? 'Treffer über Firmennamen' : 'Treffer über Personennamen' };
    }
  }
  return best;
}

async function alle(table: string, select: string, apply?: (q: any) => any): Promise<{ rows: any[]; error: boolean }> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = (supabase.from as any)(table).select(select).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) return { rows: out, error: true };
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { rows: out, error: false };
}

const metaUrl = (id: string) => `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${id.replace(/^act_/, '')}`;

/** Lädt Verknüpfungen + Vorschläge für die übergebenen Kunden (alle Tabellen einmal, auch für die Sammelansicht). */
export async function ladeStand(kunden: KundeMin[]): Promise<Map<string, Record<SystemKey, SystemStand>>> {
  const [cl, sp, km, mc, ql, qi, op, dm, vw] = await Promise.all([
    alle('close_link', 'client_id, close_lead_id, last_synced_at'),
    alle('close_lead_spiegel', 'close_lead_id, name, status_label'),
    alle('kunde_meta_accounts', 'client_id, meta_account_id, meta_account_name'),
    alle('meta_accounts_cache', 'meta_account_id, name, business_name'),
    alle('qonto_client_links', 'id, qonto_client_name, qonto_client_id, client_id, match_type, is_confirmed'),
    alle('qonto_client_invoices', 'client_name'),
    alle('onepage_projects', 'id, name, page_url, client_id_fk'),
    alle('drive_folder_mappings', 'entity_id, drive_folder_id, drive_folder_name, drive_folder_url', q => q.eq('entity_type', 'client')),
    alle('kunde_link_vorschlag_verworfen', 'client_id, system, externe_id'),
  ]);

  const leadName = new Map(sp.rows.map(r => [r.close_lead_id, r.name]));
  const closeByClient = new Map(cl.rows.map(r => [r.client_id, r]));
  const linkedLeads = new Set(cl.rows.map(r => r.close_lead_id));
  const freieLeads = sp.rows.filter(r => !linkedLeads.has(r.close_lead_id));
  const metaByClient = new Map(km.rows.filter(r => r.client_id).map(r => [r.client_id, r]));
  const linkedMeta = new Set(km.rows.map(r => String(r.meta_account_id)));
  const freieMeta = mc.rows.filter(r => !linkedMeta.has(String(r.meta_account_id)));
  const qontoByClient = new Map(ql.rows.filter(r => r.client_id && r.is_confirmed).map(r => [r.client_id, r]));
  const rechnungen = new Map<string, number>();
  for (const r of qi.rows) rechnungen.set(r.client_name, (rechnungen.get(r.client_name) || 0) + 1);
  const opByClient = new Map(op.rows.filter(r => r.client_id_fk).map(r => [r.client_id_fk, r]));
  const freieOp = op.rows.filter(r => !r.client_id_fk);
  const driveByClient = new Map(dm.rows.map(r => [r.entity_id, r]));
  const verworfen = new Set(vw.rows.map(r => `${r.client_id}:${r.system}:${r.externe_id}`));
  const ok = (k: KundeMin, s: SystemKey, id: string) => !verworfen.has(`${k.id}:${s}:${id}`);

  const out = new Map<string, Record<SystemKey, SystemStand>>();
  for (const k of kunden) {
    const st = {} as Record<SystemKey, SystemStand>;

    // Close
    const c = closeByClient.get(k.id);
    if (c) st.close = { zustand: 'verknuepft', objekt: { id: c.close_lead_id, name: leadName.get(c.close_lead_id) || null, url: `https://app.close.com/lead/${c.close_lead_id}/` } };
    else if (sp.error) st.close = { zustand: 'keine_berechtigung' };
    else {
      const t = besterName(k, freieLeads.filter(l => ok(k, 'close', l.close_lead_id)), l => l.name);
      st.close = t ? { zustand: 'vorschlag', vorschlag: { system: 'close', id: t.item.close_lead_id, name: t.item.name, url: `https://app.close.com/lead/${t.item.close_lead_id}/`, grund: [t.grund, t.item.status_label].filter(Boolean).join(' · ') } } : { zustand: 'offen' };
    }

    // Meta
    const m = metaByClient.get(k.id);
    if (m) st.meta = { zustand: 'verknuepft', objekt: { id: String(m.meta_account_id), name: m.meta_account_name, url: metaUrl(String(m.meta_account_id)) } };
    else {
      const t = besterName(k, freieMeta.filter(a => ok(k, 'meta', String(a.meta_account_id))), a => a.name || a.business_name);
      st.meta = t ? { zustand: 'vorschlag', vorschlag: { system: 'meta', id: String(t.item.meta_account_id), name: t.item.name, url: metaUrl(String(t.item.meta_account_id)), grund: t.grund } } : { zustand: 'offen' };
    }

    // Qonto
    if (ql.error) st.qonto = { zustand: 'keine_berechtigung' };
    else {
      const q = qontoByClient.get(k.id);
      const n = (name: string) => rechnungen.get(name) || 0;
      if (q) st.qonto = { zustand: 'verknuepft', objekt: { id: q.qonto_client_id || q.id, ref: q.id, name: q.qonto_client_name, detail: `${n(q.qonto_client_name)} Rechnungen` } };
      else {
        // Vorhandene, unbestätigte Zuordnung aus dem Qonto-Abgleich hat Vorrang vor eigenem Namensabgleich.
        const offen = ql.rows.find(r => r.client_id === k.id && !r.is_confirmed && ok(k, 'qonto', r.id));
        const frei = ql.rows.filter(r => !r.client_id && ok(k, 'qonto', r.id));
        const t = offen ? { item: offen, grund: offen.match_type === 'exact' ? 'Treffer über exakten Namen' : 'Treffer über Firmennamen' } : besterName(k, frei, r => r.qonto_client_name);
        st.qonto = t ? { zustand: 'vorschlag', vorschlag: { system: 'qonto', id: t.item.id, ref: t.item.id, name: t.item.qonto_client_name, grund: `${t.grund} · ${n(t.item.qonto_client_name)} Rechnungen zugeordnet` } } : { zustand: 'offen' };
      }
    }

    // Onepage
    if (op.error) st.onepage = { zustand: 'keine_berechtigung' };
    else {
      const o = opByClient.get(k.id);
      if (o) st.onepage = { zustand: 'verknuepft', objekt: { id: o.id, name: o.name, url: o.page_url } };
      else {
        const kd = domainVon(k.website_url || k.website) || domainVon(k.email);
        const kand = freieOp.filter(p => ok(k, 'onepage', p.id));
        const dom = kd ? kand.find(p => domainVon(p.page_url) === kd) : undefined;
        const t = dom ? { item: dom, grund: 'Treffer über Website-Domain' } : besterName(k, kand, p => p.name);
        st.onepage = t ? { zustand: 'vorschlag', vorschlag: { system: 'onepage', id: t.item.id, name: t.item.name, url: t.item.page_url, grund: t.grund } } : { zustand: 'offen' };
      }
    }

    // Drive
    const d = driveByClient.get(k.id);
    st.drive = d ? { zustand: 'verknuepft', objekt: { id: d.drive_folder_id, name: d.drive_folder_name, url: d.drive_folder_url || `https://drive.google.com/drive/folders/${d.drive_folder_id}` } } : { zustand: 'offen' };

    st.superchat = { zustand: 'nicht_angebunden' };
    out.set(k.id, st);
  }
  return out;
}

export function zaehle(st: Record<SystemKey, SystemStand>) {
  const vals = SYSTEME.map(s => st[s.key]);
  return {
    verknuepft: vals.filter(v => v.zustand === 'verknuepft').length,
    vorschlaege: vals.filter(v => v.zustand === 'vorschlag').length,
    gesamt: SYSTEME.length,
    luecken: SYSTEME.filter(s => s.angebunden && st[s.key].zustand !== 'verknuepft').length,
  };
}

// ---------- Suche im Zielsystem ----------
export async function suche(system: SystemKey, q: string): Promise<Objekt[]> {
  const like = `%${q}%`;
  switch (system) {
    case 'close': {
      const { data } = await (supabase.from as any)('close_lead_spiegel').select('close_lead_id, name, status_label').ilike('name', like).limit(15);
      return (data || []).map((r: any) => ({ id: r.close_lead_id, name: r.name, detail: r.status_label, url: `https://app.close.com/lead/${r.close_lead_id}/` }));
    }
    case 'meta': {
      const { data } = await supabase.from('meta_accounts_cache').select('meta_account_id, name, business_name').or(`name.ilike.${like},business_name.ilike.${like}`).limit(15);
      return (data || []).map((r: any) => ({ id: String(r.meta_account_id), name: r.name, detail: r.business_name, url: metaUrl(String(r.meta_account_id)) }));
    }
    case 'qonto': {
      const { data } = await supabase.from('qonto_client_links').select('id, qonto_client_name, qonto_client_id, client_id').ilike('qonto_client_name', like).limit(15);
      return (data || []).map((r: any) => ({ id: r.id, ref: r.id, name: r.qonto_client_name, detail: r.client_id ? 'bereits einem Kunden zugeordnet' : undefined }));
    }
    case 'onepage': {
      const { data } = await supabase.from('onepage_projects').select('id, name, page_url, client_id_fk').or(`name.ilike.${like},page_url.ilike.${like}`).limit(15);
      return (data || []).map((r: any) => ({ id: r.id, name: r.name, url: r.page_url, detail: r.client_id_fk ? 'bereits einem Kunden zugeordnet' : undefined }));
    }
    case 'drive': {
      // Kein Ordner-Index im CRM: Link oder ID einfügen.
      const m = q.match(/folders\/([\w-]{10,})/) || q.match(/^([\w-]{20,})$/);
      return m ? [{ id: m[1], name: 'Drive-Ordner', url: `https://drive.google.com/drive/folders/${m[1]}` }] : [];
    }
    default: return [];
  }
}

// ---------- Schreiben (nur nach Klick) ----------
const uid = async () => (await supabase.auth.getUser()).data.user?.id ?? null;
const chk = (r: { error: any }) => { if (r.error) throw new Error(r.error.message); };

export async function verknuepfen(system: SystemKey, clientId: string, o: Objekt) {
  switch (system) {
    case 'close':
      chk(await supabase.from('close_link' as any).insert({ client_id: clientId, close_lead_id: o.id, matched_via: 'manual', match_confidence: 1 } as any));
      // Daten sofort holen, damit Deals/Stammdaten erscheinen; Fehler hier lässt die Verknüpfung bestehen.
      try {
        const r = await supabase.functions.invoke('sync-close-lead-full', { body: { client_id: clientId } });
        if (r.error) console.warn('Close-Sync nach Verknüpfung fehlgeschlagen', r.error.message);
      } catch { /* Sync ist optional; Verknüpfung bleibt bestehen */ }
      return;
    case 'meta':
      chk(await supabase.from('kunde_meta_accounts').insert({ client_id: clientId, meta_account_id: o.id, meta_account_name: o.name, match_type: 'manual', match_confidence: 1, matched_by: await uid() } as any));
      return;
    case 'qonto':
      chk(await supabase.from('qonto_client_links').update({ client_id: clientId, is_confirmed: true, match_type: 'manual', confidence: 1 } as any).eq('id', o.ref || o.id));
      return;
    case 'onepage':
      chk(await supabase.from('onepage_projects').update({ client_id_fk: clientId } as any).eq('id', o.id));
      return;
    case 'drive':
      chk(await supabase.from('drive_folder_mappings').insert({ entity_type: 'client', entity_id: clientId, folder_section: 'root', drive_folder_id: o.id, drive_folder_url: o.url, drive_folder_name: o.name } as any));
      return;
    case 'slack': case 'pipedrive':
      chk(await (supabase.from as any)('kunde_externe_links').insert({ client_id: clientId, system, externe_id: o.id, name: o.name, url: o.url ?? null, verknuepft_von: await uid() }));
      return;
  }
}

export async function loesen(system: SystemKey, clientId: string, o: Objekt) {
  switch (system) {
    case 'close': chk(await supabase.from('close_link' as any).delete().eq('client_id', clientId)); return;
    case 'meta': chk(await supabase.from('kunde_meta_accounts').delete().eq('client_id', clientId).eq('meta_account_id', o.id)); return;
    case 'qonto': chk(await supabase.from('qonto_client_links').update({ client_id: null, is_confirmed: false } as any).eq('id', o.ref || o.id)); return;
    case 'onepage': chk(await supabase.from('onepage_projects').update({ client_id_fk: null } as any).eq('id', o.id)); return;
    case 'drive': chk(await supabase.from('drive_folder_mappings').delete().eq('entity_type', 'client').eq('entity_id', clientId)); return;
    case 'slack': case 'pipedrive':
      chk(await (supabase.from as any)('kunde_externe_links').delete().eq('client_id', clientId).eq('system', system)); return;
  }
}

export async function verwerfen(v: Vorschlag, clientId: string) {
  chk(await (supabase.from as any)('kunde_link_vorschlag_verworfen').insert({ client_id: clientId, system: v.system, externe_id: v.id, verworfen_von: await uid() }));
}
