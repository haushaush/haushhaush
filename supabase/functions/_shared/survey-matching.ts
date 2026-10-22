export type SurveyCandidate = { client_id: string; mitarbeiter_id: string; name: string; emails: string[]; vor_nachname?: string | null };
export type SurveyGrund = 'email' | 'name' | 'name+firma' | 'mehrdeutig' | 'kein_treffer';
export type SurveyMatch = { hit: SurveyCandidate | null; grund: SurveyGrund; kandidaten: string[] };

export function normalizeCompany(value: string) {
  return value.toLowerCase().replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(gmbh|ag|ug|haftungsbeschrankt|kg|ohg|gbr|inc|ltd|llc|co|ek|e k)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function companySimilarity(a: string, b: string) {
  const left = normalizeCompany(a), right = normalizeCompany(b);
  if (!left || !right) return 0;
  const row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return 1 - row[right.length] / Math.max(left.length, right.length);
}

/** Lowercase, no spaces; local part without dots and without "+suffix". */
export function normalizeEmail(value: string) {
  const v = (value || '').toLowerCase().replace(/\s+/g, '');
  const at = v.lastIndexOf('@');
  if (at <= 0) return '';
  const local = v.slice(0, at).split('+')[0].replace(/\./g, '');
  const domain = v.slice(at + 1);
  return local && domain ? `${local}@${domain}` : '';
}

export function isFreemail(domain: string) {
  return /^(gmail|googlemail|gmx|outlook|hotmail|live|yahoo|icloud|me|msn)\./.test(domain) || ['web.de', 't-online.de'].includes(domain);
}

const ids = (rows: SurveyCandidate[]) => rows.map(r => r.client_id);

/**
 * Order: 1. normalized email, 2. contact name vs name / vor_nachname (exact, then fuzzy),
 * 3. company only as tie-breaker among several name hits — never a match on its own.
 * Several hits never pick one: a wrong automatic match flows unnoticed into the bonus.
 */
export function matchSurveyDetailed(email: string, contactName: string, company: string, candidates: SurveyCandidate[]): SurveyMatch {
  const mail = normalizeEmail(email);
  if (mail) {
    const byMail = candidates.filter(c => c.emails.some(e => normalizeEmail(e) === mail));
    if (byMail.length === 1) return { hit: byMail[0], grund: 'email', kandidaten: ids(byMail) };
    if (byMail.length > 1) return { hit: null, grund: 'mehrdeutig', kandidaten: ids(byMail) };
  }
  const name = normalizeCompany(contactName || '');
  if (name) {
    const fields = (c: SurveyCandidate) => [c.name, c.vor_nachname || ''].filter(Boolean);
    let byName = candidates.filter(c => fields(c).some(f => normalizeCompany(f) === name));
    if (!byName.length && name.length >= 6) byName = candidates.filter(c => fields(c).some(f => companySimilarity(contactName, f) >= 0.92));
    if (byName.length === 1) return { hit: byName[0], grund: 'name', kandidaten: ids(byName) };
    if (byName.length > 1) {
      const firm = normalizeCompany(company || '');
      const byFirm = firm.length >= 3 ? byName.filter(c => companySimilarity(company, c.name) >= 0.92) : [];
      if (byFirm.length === 1) return { hit: byFirm[0], grund: 'name+firma', kandidaten: ids(byName) };
      return { hit: null, grund: 'mehrdeutig', kandidaten: ids(byName) };
    }
  }
  return { hit: null, grund: 'kein_treffer', kandidaten: [] };
}

/** Backwards-compatible wrapper (no contact name given). */
export function matchSurvey(email: string, company: string, candidates: SurveyCandidate[], contactName = ''): SurveyCandidate | null {
  return matchSurveyDetailed(email, contactName, company, candidates).hit;
}
