import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GROQ_API_URL  = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

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
    const { messages, model = DEFAULT_MODEL, temperature = 0.4 } = body as {
      messages: { role: string; content: string }[]
      model?: string
      temperature?: number
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages inválido' }, 400)
    }

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      return json({ error: 'Serviço de IA indisponível' }, 500)
    }

    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: 1800, temperature }),
    })

    const data = await groqRes.json()

    if (!groqRes.ok) {
      const upstream = typeof data?.error?.message === 'string' ? data.error.message : ''
      const isRateLimit =
        upstream.toLowerCase().includes('rate limit') ||
        upstream.toLowerCase().includes('tokens per minute') ||
        groqRes.status === 429
      const error = isRateLimit
        ? 'rate_limit'
        : upstream || `upstream_error_${groqRes.status}`
      return json({ error }, groqRes.status)
    }

    return new Response(JSON.stringify(data), {
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
