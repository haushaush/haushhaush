const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CHANNEL_ID = 'C0AADKWH38U';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { item_name, new_status } = await req.json();

    if (!item_name || !new_status) {
      return new Response(
        JSON.stringify({ error: 'item_name and new_status required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');
    if (!SLACK_BOT_TOKEN) {
      throw new Error('SLACK_BOT_TOKEN secret not configured');
    }

    const status = String(new_status).toLowerCase();
    const emoji = status === 'aktiv' ? '✅' : '❌';
    const action = status === 'aktiv' ? 'aktiviert' : 'deaktiviert';
    const text = `${emoji} ${item_name}'s Kampagne wurde ${action}`;

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: CHANNEL_ID, text }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Slack API error:', result);
      return new Response(
        JSON.stringify({ error: result.error || 'Slack API error', details: result }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, ts: result.ts }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('post-slack-status-notification error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
