// Temporary diagnostic: can we find leads with Client Checkins by a user in a month via Advanced Filtering?
import { closeClient, json, cors } from "../_shared/bonusClose.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const c = closeClient(Deno.env.get("CLOSE_API_KEY_SALES")!);
  const body = {
    query: { type: "and", queries: [
      { type: "object_type", object_type: "lead" },
      { type: "has_related", this_object_type: "lead", related_object_type: "activity.custom_activity", related_query: { type: "and", queries: [
        { type: "field_condition", field: { type: "regular_field", object_type: "activity.custom_activity", field_name: "custom_activity_type_id" }, condition: { type: "reference", reference_type: "custom_activity_type", object_ids: ["actitype_7JTWiuJtwme5VEukVy6kJ6"] } },
        { type: "field_condition", field: { type: "regular_field", object_type: "activity.custom_activity", field_name: "user_id" }, condition: { type: "reference", reference_type: "user_or_group", object_ids: ["user_cSZy2D3gJjQdHefmwdPY28D1jrgIXvn2G4Fct4vwdQT"] } },
        { type: "field_condition", field: { type: "regular_field", object_type: "activity.custom_activity", field_name: "activity_at" }, condition: { type: "moment_range", on_or_after: { type: "fixed_utc", value: "2026-09-30T22:00:00Z" } } },
      ] } },
    ] },
    _fields: { lead: ["id", "display_name", "status_label"] },
    _limit: 200,
  };
  try { return json(await c(`/data/search/`, "POST", body)); } catch (e) { return json({ error: String(e) }); }
});
