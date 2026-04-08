import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { bot_token } = await req.json();
    if (!bot_token) throw new Error("bot_token required");

    const allChannels: any[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        types: "public_channel,private_channel",
        limit: "200",
        exclude_archived: "true",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
        headers: { Authorization: `Bearer ${bot_token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Slack API error");

      allChannels.push(...(data.channels || []));
      cursor = data.response_metadata?.next_cursor || "";
    } while (cursor);

    allChannels.sort((a, b) => a.name.localeCompare(b.name));

    return new Response(JSON.stringify({ channels: allChannels }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
