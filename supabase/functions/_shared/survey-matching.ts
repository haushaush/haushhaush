export type SurveyCandidate = { client_id: string; mitarbeiter_id: string; name: string; emails: string[] };

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

export function isFreemail(domain: string) {
  return /^(gmail|googlemail|gmx|outlook|hotmail|live|yahoo|icloud|me|msn)\./.test(domain) || ['web.de', 't-online.de'].includes(domain);
}

export function matchSurvey(email: string, company: string, candidates: SurveyCandidate[]): SurveyCandidate | null {
  const normalized = email.trim().toLowerCase();
  const unique = (rows: SurveyCandidate[]) => rows.length === 1 ? rows[0] : null;
  const exact = candidates.filter(c => c.emails.some(e => e.trim().toLowerCase() === normalized));
  if (exact.length) return unique(exact); // Ambiguous email must not be rescued by a weaker company match.
  const domain = normalized.split('@')[1];
  if (domain && !isFreemail(domain)) {
    const domains = candidates.filter(c => c.emails.some(e => e.trim().toLowerCase().split('@')[1] === domain));
    if (domains.length) return unique(domains);
  }
  const name = normalizeCompany(company);
  if (name.length < 6) return null;
  return unique(candidates.filter(c => companySimilarity(company, c.name) >= 0.92));
}