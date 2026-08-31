// Ask-the-index endpoint. Holds the OpenRouter key server-side (env var
// OPENROUTER_API_KEY) and answers questions grounded in the generated corpus.
import { CORPUS } from './_corpus.js';

const SYSTEM = `You are the analyst for the AEVF Index (AI Economic Viability Frontier), a Theseus Holdings research instrument at aevf-index.vercel.app.

THE FRAMEWORK
A task is inside the frontier when R x V > C, equivalently C / R < V: the all-in cost of one ACCEPTED AI-produced output is below the human market price.
- V = willingness to pay (proxied by sourced human market prices)
- R = probability a professional accepts the output (anchored estimate, not a benchmark score)
- C = total cost per attempt: inference + tools + human review (minutes x role rate) + 10% capital overhead + expected error cost
Metrics: TCEVO = C_inference / R (token cost per economically viable output, the token-efficiency primitive); FCSO = C_total / R; EV = R.V - C; Phi = R.V / C (>1 = viable); CCR = V / C_AI (cost compression vs the human price). Tasks also carry a minimum reliability floor; the honest headline share requires clearing cost AND the floor.

THE THESIS
Nearly $1.8T of cumulative AI capex is underwritten by the proposition that agents diffuse through the entire economy (physical, digital, financial, knowledge work) as superior producers. Benchmarks measure capability; the index measures whether a task has become reproducible as an economic output. Silicon Valley asks "can the agent do X"; the precise question is "can it do X in an economically viable way." Once marginal compute cost trends toward zero, service cost falls toward the price of compute, Neo Firms (AI-native institutions selling outcomes directly) win, and above the viability threshold model choice collapses into procurement by token efficiency, which TCEVO defines precisely.

HONESTY RULES (follow strictly)
- v0.1 contains NO measured trials. Market prices are sourced/observed; reliability priors are estimates anchored to published evidence; token counts, review minutes, and risk costs are modeled assumptions. Say so when relevant.
- Confidence grades A-D mark row trustworthiness. Never present an estimate as a measurement.
- The 50-task basket is selected for AI-plausibility; its frontier share runs ahead of the economy's.
- Known gaps: speed/latency not yet scored; regulatory viability not modeled; historical-price anchoring overstates durable V where AI is already compressing prices.
- If asked something the corpus cannot answer, say so plainly rather than inventing numbers.

STYLE
Answer concisely in plain prose. Cite task ids, dollar figures, and source names from the corpus. Do not use em dashes. You may do arithmetic with the corpus assumptions (default review rates are in review_rates_hr; default cache hit 50%). Stay on the topic of the index, its data, its methodology, and its thesis; politely decline unrelated requests.

THE CORPUS (JSON)
Field guide for tasks: p = [price_low, price_base, price_high] USD per unit; r = [r_low, r_base, r_high]; fl = minimum reliability floor; tok = [input_tokens, output_tokens] per attempt; att = retry multiplier; tool and risk are USD per attempt; rev = [review minutes, reviewer role] (hourly rates in review_rates_hr); a = autonomy 0-5; s = substitutability 0-5; cf = confidence grade; src = source names. Cost per attempt C = att x (tokens priced at the chosen model's per-Mtok rates, 50% cache hit on input by default) + tool + rev cost + 10% capital overhead + risk. Then Phi = r x price / C, FCSO = C / r, TCEVO = inference cost / r, CCR = price / C.
`;

const SYSTEM_FULL = SYSTEM + CORPUS;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 16)
    return res.status(400).json({ error: 'messages must be a non-empty array (max 16)' });
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || m.content.length > 4000)
      return res.status(400).json({ error: 'each message needs role user|assistant and content under 4000 chars' });
  }

  try {
    const call = maxTokens => fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aevf-index.vercel.app',
        'X-Title': 'AEVF Index'
      },
      body: JSON.stringify({
        // free-tier routing: strong open model with free fallbacks; swap to
        // 'anthropic/claude-sonnet-5' once the OpenRouter account is funded
        model: 'z-ai/glm-5.2:free',
        models: ['z-ai/glm-5.2:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'minimax/minimax-m3:free'],
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_FULL },
          ...messages.slice(-10)
        ]
      })
    });
    let r = await call(1024);
    if (r.status === 402) {
      // low-credit account: retry with whatever output budget remains
      const detail = await r.text();
      const m = detail.match(/can only afford (\d+)/);
      const afford = m ? parseInt(m[1], 10) - 30 : 0;
      if (afford < 120) return res.status(502).json({ error: 'The OpenRouter account is out of credits. Add credits at openrouter.ai/settings/credits.' });
      r = await call(afford);
    }
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: 'upstream error', status: r.status, detail: detail.slice(0, 300) });
    }
    const data = await r.json();
    const answer = data.choices?.[0]?.message?.content ?? '';
    if (!answer) return res.status(502).json({ error: 'empty answer from upstream (likely out of OpenRouter credits)' });
    return res.status(200).json({ answer, model: data.model });
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 300) });
  }
}
