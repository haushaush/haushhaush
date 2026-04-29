// Shared helpers for auto-enriching showcase Meta Ads from Notion/Close Kunde data.

export function slugifyTag(prefix: string, value: string | null | undefined): string {
  if (!value) return "";
  const slug = String(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `${prefix}-${slug}` : "";
}

/**
 * Replaces auto-tags (those starting with one of the given prefixes followed by `-`)
 * with freshly generated ones. Other manual tags are preserved.
 */
export function mergeAutoTags(
  existing: string[] | null | undefined,
  autoPrefixesToReplace: string[],
  newAutoTags: string[],
): string[] {
  const manual = (existing ?? []).filter(
    (tag) => !autoPrefixesToReplace.some((prefix) => tag.startsWith(prefix + "-")),
  );
  const cleanAutoTags = newAutoTags.filter((t) => t && t.length > 0);
  return Array.from(new Set([...manual, ...cleanAutoTags]));
}

/**
 * Resolve linked Kunde for a Meta Ad by its account id.
 * 1) Direct lookup via kunde_meta_accounts.meta_account_id → close_deals
 * 2) Fuzzy substring match meta_account_name vs close_deals.client_name / unternehmen
 */
export async function resolveKundeFromMetaAccount(
  svc: any,
  metaAccountId: string,
  metaAccountName?: string | null,
): Promise<any | null> {
  if (!metaAccountId && !metaAccountName) return null;

  // Strategy 1: direct mapping
  if (metaAccountId) {
    // Try with stored value as-is and with the alternate prefixed/unprefixed form,
    // since some rows store "act_xxx" while others store "xxx".
    const candidates = [metaAccountId];
    if (metaAccountId.startsWith("act_")) candidates.push(metaAccountId.replace(/^act_/, ""));
    else candidates.push(`act_${metaAccountId}`);

    const { data: link } = await svc
      .from("kunde_meta_accounts")
      .select("kunde_id")
      .in("meta_account_id", candidates)
      .maybeSingle();

    if (link?.kunde_id) {
      const { data: kunde } = await svc
        .from("close_deals")
        .select("*")
        .eq("id", link.kunde_id)
        .maybeSingle();
      if (kunde) {
        console.log(`[resolveKundeFromMetaAccount] direct match account=${metaAccountId} → ${kunde.client_name}`);
        return kunde;
      }
    }
  }

  // Strategy 2: fuzzy match on name
  if (metaAccountName) {
    const { data: candidates } = await svc.from("close_deals").select("*");
    const cleanName = metaAccountName.toLowerCase().trim();
    const match = (candidates ?? []).find((k: any) => {
      const fields = [k.client_name, k.unternehmen, k.vor_nachname]
        .filter(Boolean)
        .map((s: string) => s.toLowerCase());
      return fields.some((f: string) => f.includes(cleanName) || cleanName.includes(f));
    });
    if (match) {
      console.log(`[resolveKundeFromMetaAccount] fuzzy match "${metaAccountName}" → "${match.client_name}"`);
      return match;
    }
  }

  return null;
}

/**
 * Map a free-text branche (potentially from a text[] column) to a showcase
 * filter option key for category=branche, applies_to=werbeanzeige.
 */
export async function mapBrancheToFilterOption(
  svc: any,
  notionBranche: string | string[] | null | undefined,
): Promise<string | null> {
  const inputs = Array.isArray(notionBranche)
    ? notionBranche.filter(Boolean)
    : notionBranche
    ? [notionBranche]
    : [];
  if (inputs.length === 0) return null;

  const { data: filterCategory } = await svc
    .from("showcase_filter_categories")
    .select("id")
    .eq("key", "branche")
    .in("applies_to", ["werbeanzeige", "both"])
    .maybeSingle();
  if (!filterCategory) return null;

  const { data: options } = await svc
    .from("showcase_filter_options")
    .select("key, label")
    .eq("category_id", filterCategory.id)
    .eq("is_active", true);

  const opts = (options ?? []) as Array<{ key: string; label: string }>;
  if (opts.length === 0) return null;

  const variations: Record<string, string> = {
    "private krankenversicherung": "pkv",
    "pkv-beamten": "pkv",
    "pkv beamte": "pkv",
    "beihilfe - pkv": "beihilfe",
    "berufsunfaehigkeit": "bu",
    "berufsunfähigkeit": "bu",
    "berufsunfaehigkeitsversicherung": "bu",
    "berufsunfähigkeitsversicherung": "bu",
    "kraftfahrt": "kfz",
    "kfz-versicherung": "kfz",
    "rechtsschutzversicherung": "rechtsschutz",
    "beihilfeversicherung": "beihilfe",
    "unfallversicherung": "unfall",
  };

  for (const raw of inputs) {
    const cleanInput = String(raw).toLowerCase().trim();
    if (!cleanInput) continue;

    // Strategy 1: exact match
    let match = opts.find(
      (o) => o.key.toLowerCase() === cleanInput || o.label.toLowerCase() === cleanInput,
    );

    // Strategy 2: substring match either direction
    if (!match) {
      match = opts.find((o) => {
        const k = o.key.toLowerCase();
        const l = o.label.toLowerCase();
        return cleanInput.includes(k) || cleanInput.includes(l) || k.includes(cleanInput) || l.includes(cleanInput);
      });
    }

    // Strategy 3: hardcoded variations
    if (!match) {
      const variantKey = variations[cleanInput];
      if (variantKey) match = opts.find((o) => o.key === variantKey);
    }

    if (match) return match.key;
  }

  console.warn(
    `[mapBrancheToFilterOption] no match for branche=${JSON.stringify(notionBranche)}; available: ${opts.map((o) => o.key).join(", ")}`,
  );
  return null;
}

/**
 * Compute enrichment payload for a Meta Ad based on the linked Kunde.
 * Always overwrites filter_values.branche, linked_kunde_id, and the auto-tag
 * subset (#kunde-*, #versicherer-*) while preserving manual tags.
 */
export async function enrichAdData(
  svc: any,
  adInput: { meta_account_id: string; meta_account_name?: string | null },
  existingFilterValues: Record<string, any> = {},
  existingTags: string[] = [],
): Promise<{
  filter_values: Record<string, any>;
  custom_tags: string[];
  linked_kunde_id: string | null;
  kunde: any | null;
}> {
  const kunde = await resolveKundeFromMetaAccount(svc, adInput.meta_account_id, adInput.meta_account_name);

  if (!kunde) {
    // Still strip stale auto-tags so a previously-linked-then-unlinked ad gets cleaned.
    const cleanedTags = mergeAutoTags(existingTags ?? [], ["kunde", "versicherer"], []);
    return {
      filter_values: existingFilterValues ?? {},
      custom_tags: cleanedTags,
      linked_kunde_id: null,
      kunde: null,
    };
  }

  const brancheKey = await mapBrancheToFilterOption(svc, kunde.branche);

  const newFilterValues: Record<string, any> = { ...(existingFilterValues ?? {}) };
  if (brancheKey) newFilterValues.branche = brancheKey;

  const kundeName: string | null = kunde.client_name || kunde.vor_nachname || null;
  // close_deals has no dedicated 'versicherer' column — `unternehmen` typically
  // contains the insurer name (e.g. "Hanse Merkur", "Allianz", "Barmenia Gothaer").
  const versicherer: string | null = kunde.unternehmen || null;

  const autoTags = [
    slugifyTag("kunde", kundeName),
    slugifyTag("versicherer", versicherer),
  ].filter(Boolean);

  const mergedTags = mergeAutoTags(existingTags ?? [], ["kunde", "versicherer"], autoTags);

  console.log(
    `[enrichAdData] kunde=${kundeName} branche=${brancheKey ?? "—"} tags=[${mergedTags.join(", ")}]`,
  );

  return {
    filter_values: newFilterValues,
    custom_tags: mergedTags,
    linked_kunde_id: kunde.id,
    kunde,
  };
}
