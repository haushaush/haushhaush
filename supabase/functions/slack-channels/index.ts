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
      const url = new URL("https://slack.com/api/conversations.list");
      url.searchParams.set("types", "public_channel,private_channel");
      url.searchParams.set("limit", "200");
      url.searchParams.set("exclude_archived", "true");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${bot_token}` },
      });
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || "Slack API error");

      allChannels.push(...(data.channels || []));
      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return new Response(JSON.stringify({ channels: allChannels }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
