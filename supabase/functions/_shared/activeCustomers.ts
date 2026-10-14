import { activeCloseCustomers, resolveClients, type Close } from "./bonusClose.ts";

/** No customer creation: live Close membership + existing stable CRM links. */
export async function loadActiveCustomers(admin: any, call: Close) {
  const leads = await activeCloseCustomers(call);
  const links = await resolveClients(admin, call, leads.map(l => l.id), new Map(leads.map(l => [l.id, l.display_name || l.id])));
  const { data: stored, error: se } = await admin.from("bonus_kunden_aktuell").select("close_lead_id,client_id").eq("close_account", "CLOSE_API_KEY_SALES").not("client_id", "is", null);
  if (se) throw new Error(se.message);
  for (const row of stored || []) links.set(row.close_lead_id, row.client_id);
  const ids = [...new Set(links.values())];
  const { data: clients, error } = await admin.from("clients").select("id,name,notion_id").is("deleted_at", null).in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (error) throw new Error(error.message);
  const byId = new Map<string, any>((clients || []).map((c: any) => [c.id, c]));
  return leads.map(lead => ({ ...lead, client: byId.get(links.get(lead.id) || "") || null }));
}