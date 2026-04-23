// match-meta-accounts
// Matches Notion-Kunden (close_deals) with Meta Ad Accounts.
// Strategy:
//   1. Pull all Meta accounts via meta-proxy (owned + client)
//   2. Pull all close_deals + already-matched + rejected
//   3. For each unmatched account: rule-based scoring (exact / substring / fuzzy)
//      - >=90 → auto-insert
//      - 60-89 → AI tiebreaker via Lovable AI Gateway. If AI confirms with >75 → auto-insert (match_type='ai')
//                else → insert into pending_meta_matches for human review
//      - <60   → ignore
//   4. Returns counts: { auto_matched, pending, no_match, total_accounts }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const META_BUSINESS_ID = Deno.env.get("META_BUSINESS_ID");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const META_API = "https://graph.facebook.com/v19.0";

// ----- string utils -----
// Generic insurance / company stopwords. Brand names (Allianz, HanseMerkur, …)
// are intentionally NOT in here — they are useful signal in combo matching.
const STOPWORDS = new Set([
  "pkv", "bu", "tkv", "kv", "versicherung", "versicherungen",
  "gmbh", "ug", "ag", "ohg", "kg", "e.k.", "ek",
  "digital", "marketing", "recruiting", "beihilfe",
  "tierkrankenversicherung",
  "büro", "buero", "office",
]);

function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : 1 + Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]);
    }
  }
  return m[b.length][a.length];
}

function ratio(a: string, b: string): number {
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return 1 - levenshtein(a, b) / max;
}

interface Kunde {
  id: string;
  client_name: string | null;
  vor_nachname: string | null;
  unternehmen: string | null; // brand multi-select like "Allianz", "HanseMerkur", "Individuell" — NOT a name
  branche: string[] | null;
}

interface Account {
  id: string;
  account_id?: string;
  name: string;
  business_name?: string;
}

interface Score {
  kunde: Kunde;
  confidence: number;
  reason: string;
}

// Returns the brand list filtered down to real, distinguishing brands.
// "Individuell" / very short / empty entries are ignored — they are not names.
function brandsOf(kunde: Kunde): string[] {
  const raw = kunde.unternehmen;
  let arr: string[] = [];
  if (Array.isArray(raw)) arr = raw as unknown as string[];
  else if (typeof raw === "string") arr = raw.split(/[,;]/);
  return arr
    .map((b) => (b || "").trim())
    .filter((b) => b.length >= 3 && b.toLowerCase() !== "individuell");
}

// Single source of truth for the customer's display / matching name.
// Matches the slide-in panel header: vor_nachname → client_name → "".
function customerNameOf(kunde: Kunde): string {
  return (kunde.vor_nachname?.trim() || kunde.client_name?.trim() || "");
}

function scoreKundeAgainstAccount(kunde: Kunde, acc: Account): Score | null {
  const accName = norm(acc.name);
  const accBiz = norm(acc.business_name || "");
  const accFull = `${accName} ${accBiz}`.trim();
  const accFullTokens = new Set(accFull.split(" ").filter(Boolean));

  const customerName = customerNameOf(kunde);
  const person = norm(customerName);
  const brands = brandsOf(kunde).map(norm).filter(Boolean);

  if (!person && brands.length === 0) return null;

  // a) Exact: customer name == account name
  if (person && (accName === person || accBiz === person)) {
    return { kunde, confidence: 100, reason: `Exact: "${person}" === account name` };
  }

  // b) Substring: full customer name appears in account name (e.g. "dustin kroczynski" in "allianz dustin kroczynski")
  if (person && person.length >= 5 && accFull.includes(person)) {
    return { kunde, confidence: 95, reason: `Customer "${person}" found in account name` };
  }

  // c) Last name only — strongest single-token signal for "Brand Person" style accounts
  if (person) {
    const parts = person.split(" ").filter((p) => p.length >= 4);
    const lastName = parts[parts.length - 1];
    if (lastName && accFullTokens.has(lastName)) {
      // d) Brand + last name combo → very strong
      const matchedBrand = brands.find((b) => accFull.includes(b));
      if (matchedBrand) {
        return {
          kunde,
          confidence: 92,
          reason: `Brand "${matchedBrand}" + last name "${lastName}" both in account`,
        };
      }
      return { kunde, confidence: 85, reason: `Last name "${lastName}" matches account` };
    }
  }

  // e) First name in account too (weaker — only count when combined with brand)
  if (person && brands.length > 0) {
    const tokensInPerson = person.split(" ").filter((p) => p.length >= 3);
    const personTokensInAcc = tokensInPerson.filter((t) => accFullTokens.has(t)).length;
    const matchedBrand = brands.find((b) => accFull.includes(b));
    if (matchedBrand && personTokensInAcc >= 1) {
      const conf = personTokensInAcc >= 2 ? 88 : 75;
      return {
        kunde,
        confidence: conf,
        reason: `Brand "${matchedBrand}" + ${personTokensInAcc} name token(s) in account`,
      };
    }
  }

  // f) Token-overlap fuzzy on customer name vs account
  const accTokens = new Set(tokens(acc.name + " " + (acc.business_name || "")));
  const kundeTokens = tokens(`${customerName} ${brands.join(" ")}`);
  if (kundeTokens.length > 0 && accTokens.size > 0) {
    const overlap = kundeTokens.filter((t) => accTokens.has(t)).length;
    const overlapRatio = overlap / Math.max(kundeTokens.length, accTokens.size);
    if (overlap >= 1 && overlapRatio >= 0.4) {
      const conf = Math.min(78, Math.round(60 + overlapRatio * 30));
      return {
        kunde,
        confidence: conf,
        reason: `${overlap} token overlap (${kundeTokens.filter((t) => accTokens.has(t)).join(", ")})`,
      };
    }
  }

  // g) Levenshtein fallback on customer name
  if (person && person.length >= 5 && accName.length >= 4) {
    const r = ratio(person, accName);
    if (r >= 0.75) {
      return { kunde, confidence: Math.round(r * 100), reason: `Fuzzy ratio ${(r * 100).toFixed(0)}%` };
    }
  }

  return null;
}

async function fetchMetaAccounts(): Promise<Account[]> {
  if (!META_TOKEN || !META_BUSINESS_ID) {
    throw new Error("META_ACCESS_TOKEN / META_BUSINESS_ID not configured");
  }
  const fields = "id,account_id,name,business_name,account_status,currency";
  const fetchPage = async (path: string): Promise<any[]> => {
    const url = `${META_API}/${META_BUSINESS_ID}/${path}?fields=${fields}&limit=200&access_token=${META_TOKEN}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "Meta API error");
    return json.data || [];
  };
  const [owned, client] = await Promise.all([
    fetchPage("owned_ad_accounts").catch(() => []),
    fetchPage("client_ad_accounts").catch(() => []),
  ]);
  const map = new Map<string, Account>();
  [...owned, ...client].forEach((a: any) => map.set(a.id, a));
  return Array.from(map.values());
}

async function aiTiebreaker(
  kunde: Kunde,
  account: Account,
  ruleConfidence: number,
  reason: string,
): Promise<{ is_match: boolean; confidence: number; reasoning: string } | null> {
  if (!LOVABLE_API_KEY) return null;
  const customerName = kunde.vor_nachname?.trim() || kunde.client_name?.trim() || "(unknown)";
  const brandList = (() => {
    const raw = kunde.unternehmen as unknown;
    let arr: string[] = [];
    if (Array.isArray(raw)) arr = raw as string[];
    else if (typeof raw === "string") arr = (raw as string).split(/[,;]/);
    return arr.map((b) => (b || "").trim()).filter((b) => b.length >= 3 && b.toLowerCase() !== "individuell");
  })();

  const prompt = `You are matching a customer to a Meta Ads account for a German insurance marketing agency.

Customer:
- Name: ${customerName}
- Brand tags: ${brandList.length ? brandList.join(", ") : "(none)"}
- Branche: ${(kunde.branche || []).join(", ") || "(none)"}

Meta Account:
- Name: ${account.name}
- Business name: ${account.business_name || "(none)"}

Rule-based score: ${ruleConfidence} (${reason})

Insurance agents often have accounts like "Allianz Max Mustermann" or "HanseMerkur - Büro Schmidt". The customer's actual name is what should appear in the account name (sometimes alongside a brand). Decide whether this is the same entity.

Respond ONLY with JSON: {"is_match": boolean, "confidence": 0-100, "reasoning": "one short sentence"}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.warn("AI tiebreaker failed", res.status);
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("AI tiebreaker error", (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = new Date().toISOString();
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1. Fetch
    const [accounts, kundenRes, matchedRes, rejectedRes] = await Promise.all([
      fetchMetaAccounts(),
      supabase.from("close_deals").select("id, client_name, vor_nachname, unternehmen, branche"),
      supabase.from("kunde_meta_accounts").select("meta_account_id"),
      supabase.from("rejected_meta_matches").select("kunde_id, meta_account_id"),
    ]);

    const kunden = (kundenRes.data || []) as Kunde[];
    const matchedSet = new Set((matchedRes.data || []).map((r: any) => r.meta_account_id));
    const rejectedSet = new Set(
      (rejectedRes.data || []).map((r: any) => `${r.kunde_id}::${r.meta_account_id}`),
    );

    // Clear pending — they will be re-evaluated
    await supabase.from("pending_meta_matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    let autoMatched = 0;
    let pending = 0;
    let noMatch = 0;
    const insertsAuto: any[] = [];
    const insertsPending: any[] = [];

    for (const acc of accounts) {
      if (matchedSet.has(acc.id)) continue;

      // Score against every customer
      const candidates: Score[] = [];
      for (const k of kunden) {
        if (rejectedSet.has(`${k.id}::${acc.id}`)) continue;
        const s = scoreKundeAgainstAccount(k, acc);
        if (s) candidates.push(s);
      }
      candidates.sort((a, b) => b.confidence - a.confidence);
      const best = candidates[0];

      if (!best) {
        noMatch++;
        continue;
      }

      if (best.confidence >= 90) {
        insertsAuto.push({
          kunde_id: best.kunde.id,
          meta_account_id: acc.id,
          meta_account_name: acc.name,
          match_type: "auto",
          match_confidence: best.confidence,
        });
        autoMatched++;
      } else if (best.confidence >= 60) {
        // AI tiebreaker
        const ai = await aiTiebreaker(best.kunde, acc, best.confidence, best.reason);
        if (ai && ai.is_match && ai.confidence >= 75) {
          insertsAuto.push({
            kunde_id: best.kunde.id,
            meta_account_id: acc.id,
            meta_account_name: acc.name,
            match_type: "ai",
            match_confidence: ai.confidence,
          });
          autoMatched++;
        } else {
          insertsPending.push({
            kunde_id: best.kunde.id,
            meta_account_id: acc.id,
            meta_account_name: acc.name,
            confidence: ai?.confidence ?? best.confidence,
            reasoning: ai?.reasoning ?? best.reason,
            source: ai ? "ai" : "rule",
          });
          pending++;
        }
      } else {
        noMatch++;
      }
    }

    if (insertsAuto.length > 0) {
      const { error } = await supabase
        .from("kunde_meta_accounts")
        .upsert(insertsAuto, { onConflict: "meta_account_id", ignoreDuplicates: true });
      if (error) console.error("auto insert error", error);
    }
    if (insertsPending.length > 0) {
      const { error } = await supabase
        .from("pending_meta_matches")
        .upsert(insertsPending, { onConflict: "meta_account_id", ignoreDuplicates: true });
      if (error) console.error("pending insert error", error);
    }

    // Persist run summary into app_settings for the admin UI
    await supabase.from("app_settings").upsert(
      {
        key: "meta_match_last_run",
        value: {
          ran_at: new Date().toISOString(),
          started_at: startedAt,
          auto_matched: autoMatched,
          pending,
          no_match: noMatch,
          total_accounts: accounts.length,
        },
      },
      { onConflict: "key" },
    );

    return new Response(
      JSON.stringify({
        ok: true,
        auto_matched: autoMatched,
        pending,
        no_match: noMatch,
        total_accounts: accounts.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("match-meta-accounts error", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
