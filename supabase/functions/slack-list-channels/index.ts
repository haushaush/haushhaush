import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('SLACK_BOT_TOKEN');
    if (!token) throw new Error('SLACK_BOT_TOKEN not configured');

    const allChannels: any[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 20;

    while (pageCount < MAX_PAGES) {
      const url = new URL('https://slack.com/api/conversations.list');
      url.searchParams.set('types', 'public_channel,private_channel');
      url.searchParams.set('limit', '200');
      url.searchParams.set('exclude_archived', 'true');
      if (cursor) url.searchParams.set('cursor', cursor);

      const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (!data.ok) throw new Error(`Slack API: ${data.error}`);

      for (const c of data.channels ?? []) {
        allChannels.push({
          id: c.id,
          name: c.name,
          is_private: c.is_private,
          is_member: c.is_member,
          num_members: c.num_members,
          topic: c.topic?.value || '',
          purpose: c.purpose?.value || '',
          created: c.created,
        });
      }

      cursor = data.response_metadata?.next_cursor;
      if (!cursor || cursor === '') break;
      pageCount++;
      await new Promise(r => setTimeout(r, 200));
    }

    allChannels.sort((a, b) => {
      if (a.is_private !== b.is_private) return a.is_private ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    const teamInfoResponse = await fetch('https://slack.com/api/team.info', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const teamData = await teamInfoResponse.json();

    return new Response(JSON.stringify({
      success: true,
      team: { name: teamData.team?.name || 'Unknown', domain: teamData.team?.domain },
      channels: allChannels,
      stats: {
        total: allChannels.length,
        public: allChannels.filter(c => !c.is_private).length,
        private: allChannels.filter(c => c.is_private).length,
        bot_member: allChannels.filter(c => c.is_member).length,
      },
      pages_fetched: pageCount + 1,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    console.error('[slack-list-channels]', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
