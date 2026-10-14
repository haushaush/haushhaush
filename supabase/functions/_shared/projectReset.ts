export type ExistingProject = { id: string; client_id: string | null; name: string; projektname?: string | null; archiviert_am?: string | null; created_at: string };
export type PlannedProject = { client_id: string; close_lead_id: string; name: string; type: string | null; notion_id: string | null };
export const PROJECT_TYPES = ["Meta Werbeanzeigen", "Meta Werbebudget", "Google Werbeanzeigen", "Onepage Website - Onepage", "Onepage Website - Webflow", "Branding Website - Webflow", "Ads Landing Page - Onepage", "Ads Landing Page - Perspective", "Printdesign", "Fotoshooting", "Google Unternehmensprofil", "Development", "Videoshooting", "Leads Kaufen", "Design", "CRM", "SEO", "Social Media", "Tech Support", "Vorqualifikation", "Superchat", "Leadkauf", "Freebie erstellen"];
export function serviceValues(v: unknown): string[] {
  if (v == null || v === "") return [];
  if (!Array.isArray(v) || v.some(x => typeof x !== "string")) throw new Error("Close-Leistungen sind keine gültige Mehrfachauswahl. Es wurde nichts verändert.");
  return v.map(x => x.trim()).filter(Boolean);
}
export function mergeServices(a: unknown, b: unknown) {
  const unique = new Map<string, string>();
  for (const name of [...serviceValues(a), ...serviceValues(b)]) if (!unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
  return [...unique.values()];
}
export function resetCounts(existing: ExistingProject[], desired: PlannedProject[]) {
  const active = existing.filter(p => !p.archiviert_am).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const keys = new Set(desired.map(p => `${p.client_id}|${p.name.trim().toLowerCase()}`));
  const keptKeys = new Set<string>(); let kept = 0;
  for (const p of active) {
    const key = `${p.client_id}|${(p.projektname || p.name).trim().toLowerCase()}`;
    if (keys.has(key) && !keptKeys.has(key)) { keptKeys.add(key); kept++; }
  }
  return { current_count: active.length, archive_count: active.length - kept, keep_count: kept, create_count: desired.filter(p => !keptKeys.has(`${p.client_id}|${p.name.trim().toLowerCase()}`)).length };
}