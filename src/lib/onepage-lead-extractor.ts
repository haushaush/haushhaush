/**
 * Universal field extractor for OnePage data.
 * Works on:
 * - CSV rows (passed as flat object {column_name: value})
 * - Webhook JSON payloads (any nesting level — auto-flattens)
 * - Form-encoded webhook bodies
 *
 * IMPORTANT: This file is mirrored in src/lib/onepage-lead-extractor.ts
 * for the frontend. Keep them in sync.
 */

export interface ExtractedLead {
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  unternehmen: string | null;
  nachricht: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  form_name: string | null;
  created_at: string;
  raw_data: Record<string, unknown>;
}

function flatten(
  obj: unknown,
  prefix = '',
  result: Record<string, unknown> = {},
): Record<string, unknown> {
  if (obj == null) return result;
  if (typeof obj !== 'object') {
    if (prefix) result[prefix] = obj;
    return result;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      flatten(item, prefix ? `${prefix}.${idx}` : String(idx), result);
    });
    return result;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      flatten(value, newKey, result);
    } else {
      result[newKey] = value as unknown;
    }
  }
  return result;
}

function unwrapFieldArray(payload: Record<string, unknown>): Record<string, unknown> {
  const wrappers = [
    'fields', 'data', 'lead', 'submission', 'form_data', 'formData', 'answers', 'inputs',
  ];
  for (const wrapper of wrappers) {
    const inner = payload[wrapper];
    if (
      Array.isArray(inner) &&
      inner.every(
        (i) => i && typeof i === 'object' && ('name' in i || 'label' in i || 'key' in i),
      )
    ) {
      const result: Record<string, unknown> = {};
      for (const item of inner as Array<Record<string, unknown>>) {
        const key = (item.name || item.label || item.key) as string | undefined;
        const val =
          item.value !== undefined
            ? item.value
            : item.answer !== undefined
              ? item.answer
              : item.input;
        if (key && val !== undefined) {
          result[String(key)] = val;
        }
      }
      return { ...result, ...payload };
    }
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return { ...(inner as Record<string, unknown>), ...payload };
    }
  }
  return payload;
}

function isValidValue(val: unknown): boolean {
  if (val == null) return false;
  const s = String(val).trim();
  if (s.length === 0) return false;
  const lower = s.toLowerCase();
  return !(
    s === '+' ||
    s === '-' ||
    s === '–' ||
    s === '0' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'false' ||
    lower === 'n/a' ||
    lower === 'na'
  );
}

function clean(val: unknown): string {
  return String(val).trim();
}

function findByKeyPattern(
  payload: Record<string, unknown>,
  patterns: Array<string | RegExp>,
): string | null {
  const keys = Object.keys(payload);
  // Pass 1: exact case-insensitive match (for strings) / regex match
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      const matched = keys.find((k) => k.toLowerCase() === pattern.toLowerCase());
      if (matched && isValidValue(payload[matched])) return clean(payload[matched]);
    } else {
      const matched = keys.find((k) => pattern.test(k));
      if (matched && isValidValue(payload[matched])) return clean(payload[matched]);
    }
  }
  // Pass 2: substring fuzzy match for string patterns only
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      const matched = keys.find((k) => k.toLowerCase().includes(pattern.toLowerCase()));
      if (matched && isValidValue(payload[matched])) return clean(payload[matched]);
    }
  }
  return null;
}

function findByValuePattern(
  payload: Record<string, unknown>,
  valueRegex: RegExp,
): string | null {
  for (const val of Object.values(payload)) {
    if (val == null) continue;
    const s = String(val).trim();
    if (valueRegex.test(s)) return s;
  }
  return null;
}

export function extractLead(rawPayload: unknown): ExtractedLead {
  const base: Record<string, unknown> =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : {};

  const unwrapped = unwrapFieldArray(base);
  const flat = flatten(unwrapped);
  const search = { ...flat, ...unwrapped };

  // EMAIL
  let email = findByKeyPattern(search, [
    'email',
    'e-mail',
    'mail',
    'email_address',
    'EmailAddress',
    'e-mail adresse',
    /^.*e[\s\-_]?mail.*$/i,
    /^📧.*$/,
  ]);
  if (!email) {
    email = findByValuePattern(search, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  }

  // PHONE
  let telefon = findByKeyPattern(search, [
    'phone',
    'telefon',
    'tel',
    'phone_number',
    'phoneNumber',
    'Phone Number',
    'mobil',
    'mobile',
    'handy',
    'handynummer',
    /^.*phone.*$/i,
    /^.*telefon.*$/i,
  ]);
  if (!telefon) {
    const phoneCandidate = findByValuePattern(search, /^\+?[\d\s\-\(\)\/]{7,20}$/);
    if (phoneCandidate) {
      const digits = phoneCandidate.replace(/[^\d]/g, '');
      if (digits.length >= 7 && digits.length <= 15) telefon = phoneCandidate;
    }
  }
  if (telefon) {
    telefon = telefon.replace(/[^\d+]/g, '');
    if (!telefon) telefon = null;
  }

  // NAMES
  let vorname = findByKeyPattern(search, [
    'first_name',
    'firstname',
    'FirstName',
    'First name',
    'vorname',
    'Vorname',
    'name (first name)',
    /name\s*\(\s*first/i,
    /first.*name/i,
  ]);
  let nachname = findByKeyPattern(search, [
    'last_name',
    'lastname',
    'LastName',
    'Last name',
    'nachname',
    'Nachname',
    'name (last name)',
    /name\s*\(\s*last/i,
    /last.*name/i,
  ]);
  if (!vorname || !nachname) {
    const fullName = findByKeyPattern(search, [
      'Vor- & Nachname',
      'vor- & nachname',
      'name',
      'full_name',
      'fullName',
      'FullName',
      'Name',
    ]);
    if (fullName) {
      const parts = fullName.trim().split(/\s+/);
      if (parts.length >= 2) {
        if (!vorname) vorname = parts.slice(0, -1).join(' ');
        if (!nachname) nachname = parts[parts.length - 1];
      } else if (parts.length === 1 && !vorname) {
        vorname = parts[0];
      }
    }
  }

  // COMPANY
  const unternehmen = findByKeyPattern(search, [
    'company',
    'unternehmen',
    'firma',
    'organization',
    'business',
    'Company',
    'Unternehmen',
  ]);

  // MESSAGE
  const nachricht = findByKeyPattern(search, [
    'message',
    'nachricht',
    'comment',
    'kommentar',
    'note',
    'textarea',
    'anmerkungen',
    'besondere wünsche',
    /^message.*$/i,
    /^nachricht.*$/i,
  ]);

  // UTM
  const utm_source = findByKeyPattern(search, ['utm_source', 'UTM source', 'Utm_source', 'utm source']);
  const utm_medium = findByKeyPattern(search, ['utm_medium', 'UTM medium', 'utm medium']);
  const utm_campaign = findByKeyPattern(search, ['utm_campaign', 'UTM campaign', 'utm campaign']);
  const utm_content = findByKeyPattern(search, ['utm_content', 'UTM content', 'utm content']);
  const utm_term = findByKeyPattern(search, ['utm_term', 'UTM term', 'utm term']);

  // FORM NAME
  const form_name = findByKeyPattern(search, [
    'form',
    'Form',
    'formular',
    'funnel',
    'page_name',
    'pageName',
  ]);

  // DATE
  const dateRaw = findByKeyPattern(search, [
    'date',
    'datum',
    'created_at',
    'createdAt',
    'erstellt am',
    'submitted_at',
    'submitted at',
    'timestamp',
    'received_at',
    'Date',
    'Datum',
  ]);

  let created_at: string;
  if (dateRaw) {
    const direct = new Date(dateRaw);
    if (!isNaN(direct.getTime())) {
      created_at = direct.toISOString();
    } else {
      const deMatch = dateRaw.match(
        /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[\sT]+(\d{1,2}):(\d{2}))?/,
      );
      if (deMatch) {
        const [, d, m, y, h = '0', min = '0'] = deMatch;
        const parsed = new Date(+y, +m - 1, +d, +h, +min);
        created_at = !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
      } else {
        created_at = new Date().toISOString();
      }
    }
  } else {
    created_at = new Date().toISOString();
  }

  return {
    vorname,
    nachname,
    email,
    telefon,
    unternehmen,
    nachricht,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    form_name,
    created_at,
    raw_data: base,
  };
}
