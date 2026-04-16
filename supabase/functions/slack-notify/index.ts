import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!SLACK_WEBHOOK_URL) {
      return new Response(JSON.stringify({ error: "SLACK_WEBHOOK_URL nicht konfiguriert" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, type, user_email, page_url, user_name, screenshot_url } = await req.json();

    if (!message || !type) {
      return new Response(JSON.stringify({ error: "message und type sind erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typeEmoji: Record<string, string> = {
      Bug: "🐛", Darstellungsfehler: "🎨", "Funktion fehlt": "➕",
      "Falscher Text": "✏️", Sonstiges: "📝",
    };
    const icon = typeEmoji[type] || "🐛";

    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `${icon} Neuer Fehler gemeldet: ${type}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Gemeldet von:*\n${user_name || user_email || "Unbekannt"}` },
          { type: "mrkdwn", text: `*E-Mail:*\n${user_email || "–"}` },
          { type: "mrkdwn", text: `*Seite:*\n\`${page_url || "Unbekannt"}\`` },
          { type: "mrkdwn", text: `*Zeit:*\n${new Date().toLocaleString("de-DE")}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Fehlerbeschreibung:*\n${message.slice(0, 500)}` },
      },
    ];

    if (screenshot_url) {
      blocks.push({
        type: "image",
        image_url: screenshot_url,
        alt_text: "Screenshot",
      });
    }

    blocks.push(
      { type: "divider" },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Agency Hub · Bug Report` }],
      },
    );

    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${icon} Neuer Fehler: ${type}`, blocks }),
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
