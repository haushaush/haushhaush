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
    let nextCursor: string | null = null;
    let pageCount = 0;
    const MAX_PAGES = 20; // safety limit

    do {
      const params = new URLSearchParams({
        types: "public_channel,private_channel",
        limit: "200",
        exclude_archived: "true",
      });
      if (nextCursor) params.set("cursor", nextCursor);

      const res = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
        headers: { 
          Authorization: `Bearer ${bot_token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();

      if (!data.ok) throw new Error(data.error || "Slack API error");

      allChannels.push(...(data.channels || []));

      const next = data.response_metadata?.next_cursor;
      nextCursor = (next && next.length > 0) ? next : null;
      pageCount++;

    } while (nextCursor !== null && pageCount < MAX_PAGES);

    allChannels.sort((a: any, b: any) => a.name.localeCompare(b.name));

    return new Response(JSON.stringify({ 
      channels: allChannels,
      total: allChannels.length,
      pages: pageCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
