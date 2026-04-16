import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/triggers/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';

    const { message, type, user_email, page_url } = await req.json();

    if (!message || !type) {
      return new Response(JSON.stringify({ error: "message und type sind erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Fehlermeldung: `🐛 Fehler von ${user_email || 'Unbekannt'}\n📍 Seite: ${page_url || 'Unbekannt'}\n🕐 Zeit: ${new Date().toLocaleString('de-DE')}\n\n📝 Beschreibung:\n${message}`
      })
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text();
      console.error("Slack webhook error:", slackRes.status, errText);
      return new Response(JSON.stringify({ error: "Slack webhook fehlgeschlagen" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await slackRes.text();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("slack-notify error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
