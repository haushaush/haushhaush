import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let members: any[] = [];
  try {
    const body = await req.json();
    members = body?.members || [];
  } catch {
    members = [];
  }

  if (members.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "No members provided" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Delete old removed members + all members we're about to re-seed
  const emailsToDelete = [
    "jonas@viralconnect.de",
    "timo@stich.digital",
    ...members.map((m: any) => m.email),
  ];

  await supabase.from("team").delete().in("email", emailsToDelete);

  const { error } = await supabase.from("team").insert(members);

  return new Response(
    JSON.stringify({ success: !error, error: error?.message }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
