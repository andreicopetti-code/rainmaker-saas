import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Provider = 'groq' | 'deepseek'

const PROVIDERS: Record<
  Provider,
  { url: string; keyEnv: string; defaultModel: string }
> = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: 'openai/gpt-oss-120b',
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    keyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-v4-flash',
  },
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Não autenticado' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Sessão inválida' }, 401)
    }

    const body = await req.json()
    const {
      messages,
      temperature = 0.4,
      provider: bodyProvider,
      model: bodyModel,
    } = body as {
      messages: { role: string; content: string }[]
      model?: string
      temperature?: number
      provider?: Provider
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages inválido' }, 400)
    }

    const envProvider = (Deno.env.get('AI_PROVIDER') || '').toLowerCase()
    const provider: Provider =
      bodyProvider === 'deepseek' || bodyProvider === 'groq'
        ? bodyProvider
        : envProvider === 'deepseek'
          ? 'deepseek'
          : 'groq'

    const cfg = PROVIDERS[provider]
    const apiKey = Deno.env.get(cfg.keyEnv)
    if (!apiKey) {
      return json({ error: `${cfg.keyEnv} não configurada no servidor` }, 500)
    }

    const model = bodyModel?.trim() || cfg.defaultModel

    // DeepSeek V4 defaults to thinking mode. Thinking tokens count against max_tokens;
    // without disabling it, content often comes back empty and the UI looks like a silent no-op.
    const payload: Record<string, unknown> = {
      model,
      messages,
      max_tokens: provider === 'deepseek' ? 4096 : 1800,
      temperature,
    }
    if (provider === 'deepseek') {
      payload.thinking = { type: 'disabled' }
    }

    const upstreamRes = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    const data = await upstreamRes.json()

    if (!upstreamRes.ok) {
      const upstream = typeof data?.error?.message === 'string' ? data.error.message : ''
      const isRateLimit =
        upstream.toLowerCase().includes('rate limit') ||
        upstream.toLowerCase().includes('tokens per minute') ||
        upstreamRes.status === 429
      // Preserve upstream text (e.g. "try again in 2.5s") so askCeo can backoff-retry.
      // Keep a stable rate_limit token for client detection when upstream is empty.
      const error = isRateLimit
        ? (upstream || 'rate_limit')
        : upstream || `upstream_error_${upstreamRes.status}`
      return json({ error, provider, model, rate_limited: isRateLimit }, upstreamRes.status)
    }

    return new Response(JSON.stringify({ ...data, provider, model }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return json({ error: message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
