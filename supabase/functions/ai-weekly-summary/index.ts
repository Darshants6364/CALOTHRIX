// Supabase Edge Function: Weekly Nutrition Progress Summary
// Enforces daily limits, logs AI usage, and generates concise structured coaching summaries
// from real tracking metrics without requiring paid third-party LLM subscriptions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAILY_SUMMARY_LIMIT = 10;

interface SummaryInput {
  weekLabel: string;
  avgCalories: number;
  targetCalories: number;
  avgProtein: number;
  targetProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgFibre: number;
  targetFibre: number;
  loggedDays: number;
  weightChangeKg: number | null;
  consistencyPct: number;
}

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

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('feature', 'weekly_summary')
      .gte('created_at', dayStart.toISOString());

    if ((count ?? 0) >= DAILY_SUMMARY_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'Daily summary limit reached', fallbackSuggested: true }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const input = (await req.json()) as SummaryInput;
    const highlights: string[] = [];
    const areasToImprove: string[] = [];
    const practicalSuggestions: string[] = [];

    if (input.loggedDays > 0) {
      highlights.push(
        `Logged ${input.loggedDays}/7 days averaging ${input.avgCalories} kcal and ${input.avgProtein}g protein.`
      );
    } else {
      areasToImprove.push('No food entries logged during this week yet.');
      practicalSuggestions.push('Log at least 1 main meal per day to establish a baseline.');
    }

    if (input.targetProtein > 0 && input.loggedDays > 0) {
      const pRatio = input.avgProtein / input.targetProtein;
      if (pRatio >= 0.9) {
        highlights.push(`Strong protein consistency (${Math.round(pRatio * 100)}% of target).`);
      } else {
        areasToImprove.push(
          `Protein averaged ${input.avgProtein}g vs ${input.targetProtein}g target.`
        );
        practicalSuggestions.push(
          'Add 1 high-protein anchor per day (e.g., 150g curd/Greek yoghurt, 2 boiled eggs, paneer, or chicken breast).'
        );
      }
    }

    if (input.targetFibre > 0 && input.loggedDays > 0 && input.avgFibre < input.targetFibre * 0.75) {
      areasToImprove.push(`Fibre intake (${input.avgFibre}g/day) is below your ${input.targetFibre}g goal.`);
      practicalSuggestions.push('Include 1 bowl sambar/dal, oats, chia seeds, or extra vegetables daily.');
    }

    if (input.weightChangeKg !== null) {
      const sign = input.weightChangeKg > 0 ? '+' : '';
      highlights.push(`Recorded weekly weight shift: ${sign}${input.weightChangeKg} kg.`);
    }

    await supabase.from('ai_usage_logs').insert({
      user_id: user.id,
      feature: 'weekly_summary',
      query_hash: input.weekLabel,
      provider: 'supabase_edge_analytics',
      tokens_or_units: 1,
    });

    return new Response(
      JSON.stringify({
        provider: 'supabase_ai',
        weekLabel: input.weekLabel,
        avgCalories: input.avgCalories,
        avgProtein: input.avgProtein,
        avgCarbs: input.avgCarbs,
        avgFat: input.avgFat,
        avgFibre: input.avgFibre,
        loggedDays: input.loggedDays,
        weightChangeKg: input.weightChangeKg,
        consistencyPct: input.consistencyPct,
        headline:
          input.loggedDays >= 5
            ? 'Consistent tracking week — keep steady momentum.'
            : 'Building weekly logging momentum.',
        highlights,
        areasToImprove,
        practicalSuggestions,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Summary generation failed',
        fallbackSuggested: true,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
