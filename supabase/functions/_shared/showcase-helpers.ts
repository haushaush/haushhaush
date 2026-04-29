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
 * Compute the slug-key the same way the sync function does, so enrichment
 * matches synced options deterministically.
 */
function keyForLabel(label: string): string {
  const slug = slugifyTag("", label).replace(/^-/, "");
  return slug;
}

/**
 * Map a free-text Notion value (potentially text[] or comma-separated) to
 * a showcase filter option key for the given category, applies_to=werbeanzeige.
 *
 * Resolution order: deterministic slug match → label-insensitive match →
 * substring fallback (helps with stale manual options like "pkv" vs "PKV").
 */
export async function mapNotionValueToFilterOption(
  svc: any,
  categoryKey: string,
  notionValue: string | string[] | null | undefined,
): Promise<string | null> {
  const inputs = Array.isArray(notionValue)
    ? notionValue.filter(Boolean).map((v) => String(v).trim())
    : notionValue
    ? String(notionValue).split(",").map((v) => v.trim()).filter(Boolean)
    : [];
  if (inputs.length === 0) return null;

  const { data: filterCategory } = await svc
    .from("showcase_filter_categories")
    .select("id")
    .eq("key", categoryKey)
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

  for (const raw of inputs) {
    const expectedKey = keyForLabel(raw);
    let match = opts.find((o) => o.key === expectedKey);
    if (!match) {
      const lc = raw.toLowerCase();
      match = opts.find((o) => o.label.toLowerCase() === lc);
    }
    if (!match) {
      const lc = raw.toLowerCase();
      match = opts.find((o) => {
        const k = o.key.toLowerCase();
        const l = o.label.toLowerCase();
        return lc.includes(k) || lc.includes(l) || k.includes(lc) || l.includes(lc);
      });
    }
    if (match) return match.key;
  }

  console.warn(
    `[mapNotionValueToFilterOption] no match for ${categoryKey}=${JSON.stringify(notionValue)}; available: ${opts.map((o) => o.key).join(", ")}`,
  );
  return null;
}

/** Backward-compat wrapper used elsewhere. */
export async function mapBrancheToFilterOption(
  svc: any,
  notionBranche: string | string[] | null | undefined,
): Promise<string | null> {
  return mapNotionValueToFilterOption(svc, "branche", notionBranche);
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
    const cleanedTags = mergeAutoTags(
      existingTags ?? [],
      ["kunde", "versicherer", "unternehmen"],
      [],
    );
    return {
      filter_values: existingFilterValues ?? {},
      custom_tags: cleanedTags,
      linked_kunde_id: null,
      kunde: null,
    };
  }

  const brancheKey = await mapNotionValueToFilterOption(svc, "branche", kunde.branche);
  const unternehmenKey = await mapNotionValueToFilterOption(svc, "unternehmen", kunde.unternehmen);

  const newFilterValues: Record<string, any> = { ...(existingFilterValues ?? {}) };
  if (brancheKey) newFilterValues.branche = brancheKey;
  if (unternehmenKey) newFilterValues.unternehmen = unternehmenKey;

  const kundeName: string | null = kunde.client_name || kunde.vor_nachname || null;
  const versicherer: string | null = kunde.unternehmen || null;

  const autoTags = [
    slugifyTag("kunde", kundeName),
    slugifyTag("unternehmen", versicherer),
  ].filter(Boolean);

  const mergedTags = mergeAutoTags(
    existingTags ?? [],
    ["kunde", "versicherer", "unternehmen"],
    autoTags,
  );

  console.log(
    `[enrichAdData] kunde=${kundeName} branche=${brancheKey ?? "—"} unternehmen=${unternehmenKey ?? "—"} tags=[${mergedTags.join(", ")}]`,
  );

  return {
    filter_values: newFilterValues,
    custom_tags: mergedTags,
    linked_kunde_id: kunde.id,
    kunde,
  };
}

