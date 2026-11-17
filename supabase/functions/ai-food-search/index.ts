// Supabase Edge Function: Semantic Food Search using built-in Supabase AI (gte-small) + pgvector
// Deploy with: supabase functions deploy ai-food-search
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run: (input: string, options?: { mean_pool?: boolean; normalize?: boolean }) => Promise<number[]>;
    };
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAILY_LIMIT = 40;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { query, limit = 15 } = (await req.json()) as { query?: string; limit?: number };
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) {
      return new Response(JSON.stringify({ results: [], provider: 'supabase_ai' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enforce per-user daily AI request limit
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('feature', 'semantic_food_search')
      .gte('created_at', dayStart.toISOString());

    if ((count ?? 0) >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: 'Daily semantic AI search limit reached',
          fallbackSuggested: true,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate embedding via Supabase built-in gte-small model (no external paid API key)
    const model = new Supabase.ai.Session('gte-small');
    const embedding = await model.run(cleanQuery, { mean_pool: true, normalize: true });

    const { data: matches, error: rpcError } = await supabase.rpc('match_global_foods', {
      query_embedding: embedding,
      match_threshold: 0.42,
      match_count: Math.min(30, Math.max(5, Number(limit) || 15)),
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: rpcError.message, fallbackSuggested: true }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase.from('ai_usage_logs').insert({
      user_id: user.id,
      feature: 'semantic_food_search',
      query_hash: cleanQuery.toLowerCase().slice(0, 64),
      provider: 'supabase_gte_small',
      tokens_or_units: 1,
    });

    return new Response(
      JSON.stringify({
        provider: 'supabase_ai',
        results: matches || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Semantic search failed',
        fallbackSuggested: true,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
