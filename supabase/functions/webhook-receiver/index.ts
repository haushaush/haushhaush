import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Expected: functions/v1/webhook-receiver/{source}
    const source = pathParts[pathParts.length - 1] || 'unknown';

    const body = await req.json().catch(() => ({}));
    const xSource = req.headers.get('x-source') || source;

    console.log(`Webhook received from: ${xSource}`, JSON.stringify(body).slice(0, 500));

    switch (xSource) {
      case 'close': {
        // Close CRM deal webhook
        if (body.event === 'opportunity.updated' || body.event === 'opportunity.created') {
          const deal = body.data;
          if (deal) {
            await supabase.from('close_deals').upsert({
              close_lead_id: deal.lead_id,
              client_name: deal.lead_name || 'Unbekannt',
              wert_eur: deal.value ? deal.value / 100 : 0,
              status: deal.status_display_name || 'Aktiv',
              close_opportunity_url: `https://app.close.com/opportunities/${deal.id}`,
            }, { onConflict: 'close_lead_id' });
          }
        }
        break;
      }
      case 'n8n': {
        // n8n automation results
        if (body.action === 'sync_deals' && Array.isArray(body.deals)) {
          for (const deal of body.deals) {
            await supabase.from('close_deals').upsert(deal, { onConflict: 'close_lead_id' });
          }
        }
        if (body.action === 'create_notification' && body.notification) {
          await supabase.from('notifications').insert(body.notification);
        }
        break;
      }
      case 'onepage': {
        // OnePage form submissions
        if (body.form_id && body.data) {
          await supabase.from('notifications').insert({
            user_id: body.target_user_id || '00000000-0000-0000-0000-000000000000',
            channel: 'onepage',
            title: `Neue Formular-Einreichung: ${body.form_name || body.form_id}`,
            preview: JSON.stringify(body.data).slice(0, 200),
            tag: 'lead',
          });
        }
        break;
      }
      case 'qonto': {
        // Qonto transaction webhooks
        if (body.event_type === 'transaction.created') {
          const txn = body.data;
          if (txn) {
            await supabase.from('finance').insert({
              betrag: Math.abs(txn.amount || 0) / 100,
              typ: (txn.side === 'credit' ? 'Einnahme' : 'Ausgabe') as any,
              datum: txn.settled_at?.split('T')[0] || new Date().toISOString().split('T')[0],
              zahlstatus: 'Bezahlt',
              rechnung_nr: txn.reference || null,
            });
          }
        }
        break;
      }
      case 'slack': {
        // Slack Events API
        // URL verification
        if (body.type === 'url_verification') {
          return new Response(JSON.stringify({ challenge: body.challenge }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }
      case 'abschluss': {
        const q = (body.query || {}) as Record<string, any>;
        if (q.Name) {
          const art = Array.isArray(q.Art) ? q.Art.join(', ') : (q.Art || 'PKV');
          let leistungen: string[] = [];
          if (typeof q.Leistungen === 'string') {
            leistungen = q.Leistungen.split(',').map((s: string) => s.trim()).filter(Boolean);
          } else if (Array.isArray(q.Leistungen)) {
            leistungen = q.Leistungen;
          }
          const laufzeit = parseInt(String(q.Laufzeit || ''), 10);
          const wert = Number(q.Wert || 0);
          const startRaw = q.Start && q.Start !== '-' ? q.Start : null;
          const { error } = await supabase.from('close_deals').insert({
            client_name: q.Name,
            art,
            deal_type: q.DealTyp || q.Typ || 'Neukunde',
            wert_eur: isNaN(wert) ? 0 : wert,
            laufzeit_monate: isNaN(laufzeit) ? null : laufzeit,
            start_datum: startRaw,
            leistungen,
            status: 'Aktiv',
            anmerkungen: q.Anmerkungen ?? null,
          });
          if (error) console.error('abschluss insert failed', error);
        }
        break;
      }
      default:
        console.log(`Unknown webhook source: ${xSource}`);
    }

    return new Response(JSON.stringify({ received: true, source: xSource }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
