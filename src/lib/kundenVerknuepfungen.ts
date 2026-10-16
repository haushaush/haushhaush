import { supabase } from '@/integrations/supabase/client';

/** Alle externen Systeme eines Kunden — eine Quelle für Tab, Kacheln und Sammelansicht. */
/** Slack und Pipedrive werden nicht auf Kundenebene verknüpft. */
export type SystemKey = 'close' | 'meta' | 'qonto' | 'lexoffice' | 'onepage' | 'drive' | 'superchat' | 'portal';

export const SYSTEME: { key: SystemKey; label: string; objekt: string; angebunden: boolean }[] = [
  { key: 'close', label: 'Close', objekt: 'Lead', angebunden: true },
  { key: 'meta', label: 'Meta Ads', objekt: 'Werbekonto', angebunden: true },
  { key: 'qonto', label: 'Qonto', objekt: 'Gegenpartei', angebunden: true },
  { key: 'lexoffice', label: 'lexoffice', objekt: 'Kontakt', angebunden: true },
  { key: 'onepage', label: 'Onepage', objekt: 'Website', angebunden: true },
  { key: 'drive', label: 'Google Drive', objekt: 'Ordner', angebunden: true },
  { key: 'portal', label: 'LeadSharks Portal', objekt: 'Portalkonto', angebunden: true },
  { key: 'superchat', label: 'Superchat', objekt: 'Kontakt', angebunden: false },
];

/** belegt = Name des anderen CRM-Kunden, dem das Objekt schon gehört (Treffer bleibt sichtbar, aber gesperrt). */
export interface Objekt { id: string; name: string | null; url?: string | null; ref?: string; detail?: string; belegt?: string | null }
export interface Vorschlag extends Objekt { system: SystemKey; grund: string }
export type SystemStand =
  | { zustand: 'verknuepft'; objekt: Objekt }
  | { zustand: 'vorschlag'; vorschlag: Vorschlag }
  | { zustand: 'offen' }
  | { zustand: 'nicht_angebunden' }
  | { zustand: 'keine_berechtigung' };

export interface KundeMin { id: string; name: string | null; vor_nachname?: string | null; email?: string | null; phone?: string | null; website_url?: string | null; website?: string | null }

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

// ---------- Buchhaltung (Qonto / lexoffice) ----------
interface BuchKand { id: string; name: string | null; email: string | null; anzahl: number; letzte: string | null }
interface BuchLink { ref: string; ext: string | null; name: string | null; client_id: string | null; is_confirmed: boolean; match_type: string | null }
const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE') : null;
const buchDetail = (c?: BuchKand) => c ? [`${c.anzahl} Rechnung${c.anzahl === 1 ? '' : 'en'}`, c.letzte && `letzte ${fmtD(c.letzte)}`].filter(Boolean).join(' · ') : undefined;

function qontoKandidaten(rows: any[]): Map<string, BuchKand> {
  const m = new Map<string, BuchKand>();
  for (const r of rows) {
    if (!r.client_id) continue;
    const c = m.get(r.client_id) || { id: r.client_id, name: r.client_name, email: r.contact_email, anzahl: 0, letzte: null };
    c.anzahl++; c.name = c.name || r.client_name; c.email = c.email || r.contact_email;
    if (r.issue_date && (!c.letzte || r.issue_date > c.letzte)) c.letzte = r.issue_date;
    m.set(r.client_id, c);
  }
  return m;
}
function lexKandidaten(contacts: any[], invoices: any[]): Map<string, BuchKand> {
  const m = new Map<string, BuchKand>(contacts.map(c => [c.contact_id, { id: c.contact_id, name: c.name, email: c.email, anzahl: 0, letzte: null }]));
  for (const r of invoices) {
    const c = r.contact_id && m.get(r.contact_id); if (!c) continue;
    c.anzahl++; if (r.voucher_date && (!c.letzte || r.voucher_date > c.letzte)) c.letzte = r.voucher_date;
  }
  return m;
}
function buchStand(k: KundeMin, sys: 'qonto' | 'lexoffice', kand: Map<string, BuchKand>, links: BuchLink[],
  ok: (k: KundeMin, s: SystemKey, id: string) => boolean): SystemStand {
  const mine = links.find(l => l.client_id === k.id && l.is_confirmed);
  if (mine) {
    const c = mine.ext ? kand.get(mine.ext) : undefined;
    return { zustand: 'verknuepft', objekt: { id: mine.ext || mine.ref, ref: mine.ref, name: mine.name || c?.name || null, detail: buchDetail(c) } };
  }
  const offen = links.find(l => l.client_id === k.id && !l.is_confirmed && l.ext && ok(k, sys, l.ext));
  if (offen) {
    const c = kand.get(offen.ext!);
    return { zustand: 'vorschlag', vorschlag: { system: sys, id: offen.ext!, ref: offen.ref, name: offen.name || c?.name || null, detail: buchDetail(c), grund: offen.match_type === 'exact' ? 'Treffer über exakten Namen' : 'Treffer über Firmennamen' } };
  }
  const belegt = new Set(links.filter(l => l.client_id && l.is_confirmed && l.ext).map(l => l.ext!));
  const frei = [...kand.values()].filter(c => !belegt.has(c.id) && ok(k, sys, c.id));
  const kd = domainVon(k.email);
  const mail = kd ? frei.find(c => domainVon(c.email) === kd) : undefined;
  const t = mail ? { item: mail, grund: 'Treffer über E-Mail-Domain' } : besterName(k, frei, c => c.name);
  if (!t) return { zustand: 'offen' };
  const ref = links.find(l => l.ext === t.item.id)?.ref;
  return { zustand: 'vorschlag', vorschlag: { system: sys, id: t.item.id, ref, name: t.item.name, detail: buchDetail(t.item), grund: `${t.grund} · ${buchDetail(t.item)}` } };
}

async function belegtNamen(clientIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await supabase.from('clients').select('id, name').in('id', ids);
  return new Map((data || []).map((c: any) => [c.id, c.name || 'anderer Kunde']));
}

async function sucheBuch(sys: 'qonto' | 'lexoffice', q: string, clientId?: string): Promise<Objekt[]> {
  const like = `%${q}%`;
  let kand: BuchKand[];
  let links: { ext: string; ref: string; client_id: string | null; is_confirmed: boolean }[];
  if (sys === 'qonto') {
    const { data, error } = await supabase.from('qonto_client_invoices').select('client_id, client_name, contact_email, issue_date')
      .or(`client_name.ilike.${like},contact_email.ilike.${like}`).limit(1000);
    if (error) throw new Error(error.message);
    kand = [...qontoKandidaten(data || []).values()].slice(0, 15);
    const ids = kand.map(c => c.id);
    const { data: l } = ids.length ? await supabase.from('qonto_client_links').select('id, qonto_client_id, client_id, is_confirmed').in('qonto_client_id', ids) : { data: [] as any[] };
    links = (l || []).map((r: any) => ({ ext: r.qonto_client_id, ref: r.id, client_id: r.client_id, is_confirmed: r.is_confirmed }));
  } else {
    const { data, error } = await (supabase.from as any)('lexoffice_contacts').select('contact_id, name, email')
      .or(`name.ilike.${like},email.ilike.${like}`).limit(15);
    if (error) throw new Error(error.message);
    const ids = (data || []).map((c: any) => c.contact_id);
    const { data: inv } = ids.length ? await (supabase.from as any)('lexoffice_invoices').select('contact_id, voucher_date').in('contact_id', ids) : { data: [] };
    kand = [...lexKandidaten(data || [], inv || []).values()];
    const { data: l } = ids.length ? await (supabase.from as any)('lexoffice_client_links').select('id, lexoffice_contact_id, client_id, is_confirmed').in('lexoffice_contact_id', ids) : { data: [] };
    links = (l || []).map((r: any) => ({ ext: r.lexoffice_contact_id, ref: r.id, client_id: r.client_id, is_confirmed: r.is_confirmed }));
  }
  const fremd = links.filter(l => l.client_id && l.is_confirmed && l.client_id !== clientId);
  const namen = await belegtNamen(fremd.map(l => l.client_id!));
  return kand.map(c => {
    const l = links.find(x => x.ext === c.id);
    const f = fremd.find(x => x.ext === c.id);
    return { id: c.id, ref: l?.ref, name: c.name, detail: [buchDetail(c), c.email].filter(Boolean).join(' · '), belegt: f ? namen.get(f.client_id!) : null };
  });
}

async function buchVerknuepfen(sys: 'qonto' | 'lexoffice', clientId: string, o: Objekt) {
  const t = sys === 'qonto' ? 'qonto_client_links' : 'lexoffice_client_links';
  const extCol = sys === 'qonto' ? 'qonto_client_id' : 'lexoffice_contact_id';
  const nameCol = sys === 'qonto' ? 'qonto_client_name' : 'lexoffice_contact_name';
  const { data: ex } = await (supabase.from as any)(t).select('id, client_id, is_confirmed').eq(extCol, o.id).maybeSingle();
  if (ex?.client_id && ex.is_confirmed && ex.client_id !== clientId) {
    const n = (await belegtNamen([ex.client_id])).get(ex.client_id);
    throw new Error(`Bereits ${n} zugeordnet`);
  }
  const patch = { client_id: clientId, is_confirmed: true, match_type: 'manual', confidence: 1 };
  if (ex) chk(await (supabase.from as any)(t).update(patch).eq('id', ex.id));
  else if (sys === 'qonto') {
    // Namensindex ist eindeutig: vorhandene Zeile gleichen Namens ohne ID übernehmen.
    const { data: byName } = await supabase.from('qonto_client_links').select('id, qonto_client_id').ilike('qonto_client_name', o.name || '').maybeSingle();
    if (byName && !byName.qonto_client_id) chk(await supabase.from('qonto_client_links').update({ ...patch, qonto_client_id: o.id } as any).eq('id', byName.id));
    else chk(await supabase.from('qonto_client_links').insert({ ...patch, qonto_client_id: o.id, qonto_client_name: o.name } as any));
  } else chk(await (supabase.from as any)(t).insert({ ...patch, [extCol]: o.id, [nameCol]: o.name }));
}

/** Lädt Verknüpfungen + Vorschläge für die übergebenen Kunden (alle Tabellen einmal, auch für die Sammelansicht). */
export async function ladeStand(kunden: KundeMin[]): Promise<Map<string, Record<SystemKey, SystemStand>>> {
  const [cl, sp, km, mc, ql, qi, op, dm, vw, ll, lc, li, pl] = await Promise.all([
    alle('close_link', 'client_id, close_lead_id, last_synced_at'),
    alle('close_lead_spiegel', 'close_lead_id, name, status_label'),
    alle('kunde_meta_accounts', 'client_id, meta_account_id, meta_account_name', q => q.order('matched_at', { ascending: false }).order('meta_account_id')),
    alle('meta_accounts_cache', 'meta_account_id, name, business_name'),
    alle('qonto_client_links', 'id, qonto_client_name, qonto_client_id, client_id, match_type, is_confirmed'),
    alle('qonto_client_invoices', 'client_id, client_name, contact_email, issue_date'),
    alle('onepage_projects', 'id, name, page_url, client_id_fk'),
    alle('drive_folder_mappings', 'entity_id, drive_folder_id, drive_folder_name, drive_folder_url', q => q.eq('entity_type', 'client')),
    alle('kunde_link_vorschlag_verworfen', 'client_id, system, externe_id'),
    alle('lexoffice_client_links', 'id, lexoffice_contact_id, lexoffice_contact_name, client_id, match_type, is_confirmed'),
    alle('lexoffice_contacts', 'contact_id, name, email'),
    alle('lexoffice_invoices', 'contact_id, voucher_date'),
    alle('kunde_externe_links', 'client_id, externe_id, name, url', q => q.eq('system', 'portal')),
  ]);
  const portalByClient = new Map(pl.rows.map(r => [r.client_id, r]));
  const qKand = qontoKandidaten(qi.rows);
  const lKand = lexKandidaten(lc.rows, li.rows);

  const leadName = new Map(sp.rows.map(r => [r.close_lead_id, r.name]));
  const closeByClient = new Map(cl.rows.map(r => [r.client_id, r]));
  const linkedLeads = new Set(cl.rows.map(r => r.close_lead_id));
  const freieLeads = sp.rows.filter(r => !linkedLeads.has(r.close_lead_id));
  // Newest link per client wins (rows are sorted by matched_at desc).
  const metaByClient = new Map<string, any>();
  for (const r of km.rows) if (r.client_id && !metaByClient.has(r.client_id)) metaByClient.set(r.client_id, r);
  const linkedMeta = new Set(km.rows.map(r => String(r.meta_account_id)));
  const freieMeta = mc.rows.filter(r => !linkedMeta.has(String(r.meta_account_id)));
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
    if (km.error || mc.error) st.meta = { zustand: 'keine_berechtigung' };
    else if (m) st.meta = { zustand: 'verknuepft', objekt: { id: String(m.meta_account_id), name: m.meta_account_name, url: metaUrl(String(m.meta_account_id)) } };
    else {
      const t = besterName(k, freieMeta.filter(a => ok(k, 'meta', String(a.meta_account_id))), a => a.name || a.business_name);
      st.meta = t ? { zustand: 'vorschlag', vorschlag: { system: 'meta', id: String(t.item.meta_account_id), name: t.item.name, url: metaUrl(String(t.item.meta_account_id)), grund: t.grund } } : { zustand: 'offen' };
    }

    // Qonto + lexoffice: Kandidaten aus der vollständigen Kunden-/Kontaktliste, nicht aus der Zuordnungstabelle.
    st.qonto = ql.error || qi.error ? { zustand: 'keine_berechtigung' }
      : buchStand(k, 'qonto', qKand, ql.rows.map(r => ({ ref: r.id, ext: r.qonto_client_id, name: r.qonto_client_name, client_id: r.client_id, is_confirmed: r.is_confirmed, match_type: r.match_type })), ok);
    st.lexoffice = ll.error || lc.error ? { zustand: 'keine_berechtigung' }
      : buchStand(k, 'lexoffice', lKand, ll.rows.map(r => ({ ref: r.id, ext: r.lexoffice_contact_id, name: r.lexoffice_contact_name, client_id: r.client_id, is_confirmed: r.is_confirmed, match_type: r.match_type })), ok);

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

    // LeadSharks Portal
    const pk = portalByClient.get(k.id);
    st.portal = pl.error ? { zustand: 'keine_berechtigung' }
      : pk ? { zustand: 'verknuepft', objekt: { id: pk.externe_id, name: pk.name, url: pk.url } } : { zustand: 'offen' };

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
export async function suche(system: SystemKey, q: string, clientId?: string): Promise<Objekt[]> {
  const like = `%${q}%`;
  switch (system) {
    case 'close': {
      const { data } = await (supabase.from as any)('close_lead_spiegel').select('close_lead_id, name, status_label').ilike('name', like).limit(15);
      return (data || []).map((r: any) => ({ id: r.close_lead_id, name: r.name, detail: r.status_label, url: `https://app.close.com/lead/${r.close_lead_id}/` }));
    }
    case 'meta': {
      const { data, error } = await supabase.from('meta_accounts_cache').select('meta_account_id, name, business_name').or(`name.ilike.${like},business_name.ilike.${like}`).limit(15);
      if (error) throw new Error(error.message);
      const ids = (data || []).map(r => r.meta_account_id);
      if (!ids.length) return [];
      const { data: links, error: linkError } = await supabase.from('kunde_meta_accounts').select('meta_account_id, client_id').in('meta_account_id', ids);
      if (linkError) throw new Error(linkError.message);
      const fremd = (links || []).filter(l => l.client_id && l.client_id !== clientId);
      const namen = await belegtNamen(fremd.flatMap(l => l.client_id ? [l.client_id] : []));
      return (data || []).map(r => {
        const belegt = fremd.find(l => String(l.meta_account_id) === String(r.meta_account_id));
        return {
          id: String(r.meta_account_id), name: r.name, detail: r.business_name, url: metaUrl(String(r.meta_account_id)),
          belegt: belegt?.client_id ? (namen.get(belegt.client_id) || 'anderer Kunde') : null,
        };
      });
    }
    case 'qonto': case 'lexoffice': return sucheBuch(system, q, clientId);
    case 'portal': {
      const konten = await portalListe();
      const n = q.toLowerCase();
      const treffer = konten.filter(k => [k.email, k.company_name, k.first_name, k.last_name].some(v => (v || '').toLowerCase().includes(n))).slice(0, 20);
      const namen = await belegtNamen(treffer.map(k => k.crm_client_id).filter((id): id is string => !!id && id !== clientId));
      return treffer.map(k => ({
        id: k.id, name: k.company_name || k.email, url: PORTAL_URL,
        detail: [[k.first_name, k.last_name].filter(Boolean).join(' '), k.email, k.is_active === false && 'inaktiv'].filter(Boolean).join(' · '),
        belegt: k.crm_client_id && k.crm_client_id !== clientId ? (namen.get(k.crm_client_id) || 'anderem Kunden') : null,
      }));
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
    case 'meta': {
      const { data: ex, error } = await supabase.from('kunde_meta_accounts').select('client_id').eq('meta_account_id', o.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (ex?.client_id && ex.client_id !== clientId) {
        const n = (await belegtNamen([ex.client_id])).get(ex.client_id) || 'anderem Kunden';
        throw new Error(`Bereits ${n} zugeordnet`);
      }
      if (ex?.client_id === clientId) return;
      const ins = await supabase.from('kunde_meta_accounts').insert({ client_id: clientId, meta_account_id: o.id, meta_account_name: o.name, match_type: 'manual', match_confidence: 1, matched_by: await uid() } as any);
      if (ins.error) throw new Error(ins.error.code === '23505' ? 'Dieses Werbekonto ist bereits einem anderen Kunden zugeordnet.' : ins.error.message);
      return;
    }
    case 'qonto': case 'lexoffice': return buchVerknuepfen(system, clientId, o);
    case 'onepage':
      chk(await supabase.from('onepage_projects').update({ client_id_fk: clientId } as any).eq('id', o.id));
      return;
    case 'portal':
      chk(await (supabase.from as any)('kunde_externe_links').insert({ client_id: clientId, system: 'portal', externe_id: o.id, name: o.name, url: o.url ?? PORTAL_URL }));
      return;
    case 'drive':
      chk(await supabase.from('drive_folder_mappings').insert({ entity_type: 'client', entity_id: clientId, folder_section: 'root', drive_folder_id: o.id, drive_folder_url: o.url, drive_folder_name: o.name } as any));
      return;
  }
}

export async function loesen(system: SystemKey, clientId: string, o: Objekt) {
  switch (system) {
    case 'close': chk(await supabase.from('close_link' as any).delete().eq('client_id', clientId)); return;
    case 'meta': chk(await supabase.from('kunde_meta_accounts').delete().eq('client_id', clientId).eq('meta_account_id', o.id)); return;
    case 'qonto': chk(await supabase.from('qonto_client_links').update({ client_id: null, is_confirmed: false } as any).eq('id', o.ref || o.id)); return;
    case 'lexoffice': chk(await (supabase.from as any)('lexoffice_client_links').update({ client_id: null, is_confirmed: false }).eq('id', o.ref || o.id)); return;
    case 'onepage': chk(await supabase.from('onepage_projects').update({ client_id_fk: null } as any).eq('id', o.id)); return;
    case 'portal': chk(await (supabase.from as any)('kunde_externe_links').delete().eq('client_id', clientId).eq('system', 'portal')); return;
    case 'drive': chk(await supabase.from('drive_folder_mappings').delete().eq('entity_type', 'client').eq('entity_id', clientId)); return;
  }
}

export async function verwerfen(v: Vorschlag, clientId: string) {
  chk(await (supabase.from as any)('kunde_link_vorschlag_verworfen').insert({ client_id: clientId, system: v.system, externe_id: v.id, verworfen_von: await uid() }));
}

// ---------- LeadSharks Portal (nur über portal-bruecke, Token bleibt serverseitig) ----------
export const PORTAL_URL = 'https://leadsharks-demo.lovable.app';
export interface PortalKonto { id: string; email: string; company_name: string | null; first_name: string | null; last_name: string | null; created_at: string; crm_client_id: string | null; is_active: boolean }

async function portalAufruf(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('portal-bruecke', { body });
  if (error) {
    // Bei 4xx steckt die Portal-Antwort im Response-Kontext.
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.json === 'function') { try { return await ctx.json(); } catch { /* fällt durch */ } }
    throw new Error(error.message);
  }
  return data;
}

export async function portalListe(): Promise<PortalKonto[]> {
  const r = await portalAufruf({ action: 'list' });
  if (!r?.ok) throw new Error(r?.error || 'Portal-Kontenliste nicht abrufbar');
  return r.konten || [];
}

export async function portalAnlegen(p: { email: string; passwort: string; crm_client_id: string; firma: string; vorname: string; nachname: string; telefon: string }):
  Promise<{ ok: boolean; error?: string; profile_id?: string }> {
  const r = await portalAufruf({ action: 'create', ...p });
  if (r?.ok && r.profile_id) return { ok: true, profile_id: r.profile_id };
  return { ok: false, error: r?.error || 'unbekannter Fehler', profile_id: r?.profile_id };
}

export async function portalMeta(action: 'meta_get' | 'meta_katalog' | 'meta_anlegen' | 'meta_steuern', body: Record<string, unknown>): Promise<any> {
  return portalAufruf({ action, ...body });
}
export async function portalEinstellungen(profile_id: string): Promise<any> {
  return portalAufruf({ action: 'settings_get', profile_id });
}
export async function portalEinstellungenSetzen(profile_id: string, teile: { vertrag?: Record<string, unknown>; bereiche?: { module_key: string; enabled: boolean }[]; global_lead_limit?: number | null }): Promise<any> {
  return portalAufruf({ action: 'settings_set', profile_id, ...teile });
}
export async function portalZugangZuruecksetzen(profile_id: string, passwort: string): Promise<any> {
  return portalAufruf({ action: 'zugang_zuruecksetzen', profile_id, passwort });
}

/** 16 Zeichen aus Groß-, Kleinbuchstaben, Ziffern, Sonderzeichen – je Klasse mindestens eines, kryptografisch zufällig. */
export function erzeugePasswort(len = 16): string {
  const klassen = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?-_+='];
  const alle = klassen.join('');
  const zufall = (n: number) => { const a = new Uint32Array(1); const max = Math.floor(0x100000000 / n) * n; do crypto.getRandomValues(a); while (a[0] >= max); return a[0] % n; };
  const z = klassen.map(k => k[zufall(k.length)]);
  while (z.length < len) z.push(alle[zufall(alle.length)]);
  for (let i = z.length - 1; i > 0; i--) { const j = zufall(i + 1); [z[i], z[j]] = [z[j], z[i]]; }
  return z.join('');
}
