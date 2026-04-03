const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SLACK_CHANNEL = 'C0AA78GKJUE';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');

    const body = await req.json();
    const {
      ticket_nr,
      user_name,
      user_email,
      error_type,
      error_code,
      error_message,
      page_url,
      user_message,
      priority,
      created_at,
      error_stack,
    } = body;

    // Format timestamp
    const ts = created_at
      ? new Date(created_at).toLocaleDateString('de-DE', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : 'Unbekannt';

    const priorityEmoji = (priority === 'Hoch' || priority === 'Kritisch') ? '🔴' : priority === 'Normal' ? '🟡' : '🟢';

    // If no Slack token, just log and return success
    if (!SLACK_BOT_TOKEN) {
      console.log(`[Support Ticket] ${ticket_nr} - ${user_name} (${user_email}): ${user_message}`);
      return new Response(JSON.stringify({ success: true, note: 'No Slack token configured, ticket logged only' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🎫 Neues Support-Ticket: ${ticket_nr}`, emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${priorityEmoji} *Priorität:* ${priority}\n*Nutzer:* ${user_name || 'Anonym'} (${user_email || 'keine E-Mail'})\n*Fehlertyp:* ${error_type || '–'} (${error_code || '–'})\n*Seite:* ${page_url || '–'}\n*Zeitpunkt:* ${ts}`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Nachricht des Nutzers:*\n> ${user_message}`,
        },
      },
    ];

    if (error_message) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Fehlermeldung: \`${error_message.slice(0, 200)}\`` }],
      } as any);
    }

    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        blocks,
        text: `Neues Support-Ticket ${ticket_nr}`,
      }),
    });

    const slackData = await slackRes.json();

    // Save slack_message_ts back to the ticket if possible
    if (slackData.ok && slackData.ts) {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        await fetch(`${SUPABASE_URL}/rest/v1/support_tickets?ticket_nr=eq.${ticket_nr}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ slack_message_ts: slackData.ts }),
        });
      }
    }

    return new Response(JSON.stringify({ success: true, slack_ok: slackData.ok }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('notify-tech-support error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
