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
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.slice(7);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: tokenData, error: tokenErr } = await supabase
      .from('api_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('revoked', false)
      .single();

    if (tokenErr || !tokenData) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return jsonResponse({ error: 'Token expired' }, 401);
    }

    const scopes: string[] = tokenData.scopes || ['read'];
    const startTime = Date.now();

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const apiIdx = pathParts.indexOf('api');
    const resourceParts = pathParts.slice(apiIdx + 2);
    const resource = resourceParts[0] || '';
    const resourceId = resourceParts[1] || null;
    const subResource = resourceParts[2] || null;
    const method = req.method;

    let result: any;
    let statusCode = 200;

    switch (resource) {
      // ── DEALS ──
      case 'deals': {
        if (method === 'GET') {
          const page = parseInt(url.searchParams.get('page') || '1');
          const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
          const offset = (page - 1) * perPage;
          
          let query = supabase.from('close_deals').select('*', { count: 'exact' });
          const status = url.searchParams.get('status');
          if (status) query = query.eq('status', status);
          if (resourceId) query = query.eq('id', resourceId).single();
          else query = query.range(offset, offset + perPage - 1).order('created_at', { ascending: false });

          const { data, count, error } = await query;
          if (error) { statusCode = 400; result = { error: error.message }; }
          else result = { data, count: count || 0, page, per_page: perPage, error: null };
        } else if (method === 'POST') {
          if (!scopes.includes('write:deals') && !scopes.includes('admin')) {
            statusCode = 403;
            result = { error: 'Insufficient scope: write:deals required' };
          } else {
            const body = await req.json();
            const { data, error } = await supabase.from('close_deals').insert(body).select().single();
            statusCode = error ? 400 : 201;
            result = { data, error: error?.message || null };
          }
        } else if (method === 'PATCH' && resourceId) {
          if (!scopes.includes('write:deals') && !scopes.includes('admin')) {
            statusCode = 403;
            result = { error: 'Insufficient scope: write:deals required' };
          } else {
            // Sub-resource: /deals/:id/ampel
            if (subResource === 'ampel') {
              const body = await req.json();
              const { data, error } = await supabase.from('close_deals')
                .update({ ampelstatus: body.ampelstatus })
                .eq('id', resourceId).select().single();
              statusCode = error ? 400 : 200;
              result = { data, error: error?.message || null };
            } else {
              const body = await req.json();
              const { data, error } = await supabase.from('close_deals').update(body).eq('id', resourceId).select().single();
              statusCode = error ? 400 : 200;
              result = { data, error: error?.message || null };
            }
          }
        } else {
          statusCode = 405;
          result = { error: 'Method not allowed' };
        }
        break;
      }

      // ── TASKS ──
      case 'tasks': {
        if (method === 'GET') {
          const page = parseInt(url.searchParams.get('page') || '1');
          const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
          const offset = (page - 1) * perPage;
          
          let query = supabase.from('tasks').select('*', { count: 'exact' });
          const status = url.searchParams.get('status');
          if (status) query = query.eq('status', status);
          if (resourceId) query = query.eq('id', resourceId).single();
          else query = query.range(offset, offset + perPage - 1).order('created_at', { ascending: false });

          const { data, count, error } = await query;
          if (error) { statusCode = 400; result = { error: error.message }; }
          else result = { data, count: count || 0, page, per_page: perPage, error: null };
        } else if (method === 'POST') {
          if (!scopes.includes('write:tasks') && !scopes.includes('admin')) {
            statusCode = 403;
            result = { error: 'Insufficient scope: write:tasks required' };
          } else {
            const body = await req.json();
            const { data, error } = await supabase.from('tasks').insert(body).select().single();
            statusCode = error ? 400 : 201;
            result = { data, error: error?.message || null };
          }
        } else if (method === 'PATCH' && resourceId) {
          if (!scopes.includes('write:tasks') && !scopes.includes('admin')) {
            statusCode = 403;
            result = { error: 'Insufficient scope: write:tasks required' };
          } else {
            const body = await req.json();
            const { data, error } = await supabase.from('tasks').update(body).eq('id', resourceId).select().single();
            statusCode = error ? 400 : 200;
            result = { data, error: error?.message || null };
          }
        } else if (method === 'DELETE' && resourceId) {
          if (!scopes.includes('write:tasks') && !scopes.includes('admin')) {
            statusCode = 403;
            result = { error: 'Insufficient scope: write:tasks required' };
          } else {
            const { error } = await supabase.from('tasks').delete().eq('id', resourceId);
            statusCode = error ? 400 : 200;
            result = { success: !error, error: error?.message || null };
          }
        } else {
          statusCode = 405;
          result = { error: 'Method not allowed' };
        }
        break;
      }

      // ── INVOICES ──
      case 'invoices': {
        if (method === 'GET') {
          const page = parseInt(url.searchParams.get('page') || '1');
          const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
          const offset = (page - 1) * perPage;
          
          let query = supabase.from('invoices').select('*', { count: 'exact' });
          const status = url.searchParams.get('status');
          if (status) query = query.eq('status', status);
          if (resourceId) query = query.eq('id', resourceId).single();
          else query = query.range(offset, offset + perPage - 1).order('created_at', { ascending: false });

          const { data, count, error } = await query;
          if (error) { statusCode = 400; result = { error: error.message }; }
          else result = { data, count: count || 0, page, per_page: perPage, error: null };
        } else if (method === 'POST') {
          if (!scopes.includes('write:invoices') && !scopes.includes('admin')) {
            statusCode = 403;
            result = { error: 'Insufficient scope: write:invoices required' };
          } else {
            const body = await req.json();
            const { data, error } = await supabase.from('invoices').insert(body).select().single();
            statusCode = error ? 400 : 201;
            result = { data, error: error?.message || null };
          }
        } else if (method === 'PATCH' && resourceId) {
          if (!scopes.includes('write:invoices') && !scopes.includes('admin')) {
            statusCode = 403;
            result = { error: 'Insufficient scope: write:invoices required' };
          } else {
            if (subResource === 'status') {
              const body = await req.json();
              const { data, error } = await supabase.from('invoices')
                .update({ status: body.status })
                .eq('id', resourceId).select().single();
              statusCode = error ? 400 : 200;
              result = { data, error: error?.message || null };
            } else {
              const body = await req.json();
              const { data, error } = await supabase.from('invoices').update(body).eq('id', resourceId).select().single();
              statusCode = error ? 400 : 200;
              result = { data, error: error?.message || null };
            }
          }
        } else {
          statusCode = 405;
          result = { error: 'Method not allowed' };
        }
        break;
      }

      // ── AD BUDGETS ──
      case 'ad-budgets': {
        if (method === 'GET') {
          const page = parseInt(url.searchParams.get('page') || '1');
          const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
          const offset = (page - 1) * perPage;

          let query = supabase.from('ad_budgets').select('*', { count: 'exact' });
          const name = url.searchParams.get('name');
          if (name) query = query.ilike('name', `%${name}%`);
          if (resourceId) query = query.eq('id', resourceId).single();
          else query = query.range(offset, offset + perPage - 1).order('created_at', { ascending: false });

          const { data, count, error } = await query;
          if (error) { statusCode = 400; result = { error: error.message }; }
          else result = { data, count: count || 0, page, per_page: perPage, error: null };
        } else if (method === 'PATCH' && resourceId) {
          if (!scopes.includes('write:deals') && !scopes.includes('admin')) {
            statusCode = 403;
            result = { error: 'Insufficient scope: write:deals or admin required' };
          } else {
            if (subResource === 'ausgegeben') {
              const body = await req.json();
              const { data, error } = await supabase.from('ad_budgets')
                .update({ ausgegeben: body.ausgegeben, last_synced_at: new Date().toISOString(), sync_status: 'synced' })
                .eq('id', resourceId).select().single();
              statusCode = error ? 400 : 200;
              result = { data, error: error?.message || null };
            } else {
              const body = await req.json();
              const { data, error } = await supabase.from('ad_budgets').update(body).eq('id', resourceId).select().single();
              statusCode = error ? 400 : 200;
              result = { data, error: error?.message || null };
            }
          }
        } else if (method === 'POST' && resourceId && subResource === 'sync') {
          result = { message: 'Sync triggered', budget_id: resourceId, error: null };
        } else {
          statusCode = 405;
          result = { error: 'Method not allowed' };
        }
        break;
      }

      // ── TEAM ──
      case 'team': {
        if (method === 'GET') {
          const { data, count, error } = await supabase.from('team').select('*', { count: 'exact' }).order('name');
          if (error) { statusCode = 400; result = { error: error.message }; }
          else result = { data, count: count || 0, page: 1, per_page: 100, error: null };
        } else {
          statusCode = 405;
          result = { error: 'Method not allowed' };
        }
        break;
      }

      // ── SALES PERFORMANCE ──
      case 'sales-performance': {
        if (method === 'GET') {
          const period = url.searchParams.get('period') || 'week';
          let query = supabase.from('sales_performance').select('*', { count: 'exact' });
          if (period === 'week') {
            const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
            query = query.gte('datum', weekAgo);
          } else if (period === 'month') {
            const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
            query = query.gte('datum', monthAgo);
          }
          query = query.order('datum', { ascending: false });
          const { data, count, error } = await query;
          if (error) { statusCode = 400; result = { error: error.message }; }
          else result = { data, count: count || 0, error: null };
        } else {
          statusCode = 405;
          result = { error: 'Method not allowed' };
        }
        break;
      }

      // ── NOTIFICATIONS ──
      case 'notifications': {
        if (method === 'POST') {
          const body = await req.json();
          const { data, error } = await supabase.from('notifications').insert(body).select().single();
          statusCode = error ? 400 : 201;
          result = { data, error: error?.message || null };
        } else {
          statusCode = 405;
          result = { error: 'Method not allowed' };
        }
        break;
      }

      // ── ARIA ──
      case 'aria': {
        if (resourceParts[1] === 'message' && method === 'POST') {
          const body = await req.json();
          if (!body.message) {
            statusCode = 400;
            result = { error: 'message field required' };
          } else {
            // Store ARIA interaction
            await supabase.from('aria_interactions').insert({
              user_id: tokenData.user_id,
              user_message: body.message,
              aria_response: 'API-triggered message received.',
              session_context: { source: 'api', execute_actions: body.execute_actions || false },
            });
            result = {
              response: `Nachricht empfangen: "${body.message}"`,
              actions_executed: [],
              action_results: [],
              error: null,
            };
            statusCode = 200;
          }
        } else if (resourceParts[1] === 'automate' && method === 'POST') {
          const body = await req.json();
          const { data: automation } = await supabase.from('aria_automations')
            .select('*')
            .ilike('name', `%${body.automation_name || ''}%`)
            .eq('active', true)
            .maybeSingle();
          if (!automation) {
            statusCode = 404;
            result = { error: `Automation "${body.automation_name}" not found` };
          } else {
            result = { automation_id: automation.id, name: automation.name, triggered: true, error: null };
          }
        } else {
          statusCode = 404;
          result = { error: 'Not found' };
        }
        break;
      }

      // ── AUTH ──
      case 'auth': {
        if (resourceParts[1] === 'verify') {
          result = { valid: true, scopes, expires_at: tokenData.expires_at, error: null };
        } else {
          statusCode = 404;
          result = { error: 'Not found' };
        }
        break;
      }

      default:
        statusCode = 404;
        result = { error: `Unknown resource: ${resource}` };
    }

    const responseTime = Date.now() - startTime;

    await supabase.from('api_logs').insert({
      token_id: tokenData.id,
      method,
      endpoint: `/${resource}${resourceId ? `/${resourceId}` : ''}${subResource ? `/${subResource}` : ''}`,
      status_code: statusCode,
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      response_time_ms: responseTime,
    });

    await supabase.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tokenData.id);

    return jsonResponse(result, statusCode);
  } catch (error) {
    console.error('API Error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
