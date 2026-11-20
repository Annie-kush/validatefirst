import { config } from './config.js';
import { sleep } from './util.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

// When no ANTHROPIC_API_KEY is configured the app runs in demo mode (see mock.js).
export const llmAvailable = () => !!config.anthropicKey;

export async function createMessage({ system, messages, tools, toolChoice, maxTokens = 4096 }) {
  const body = { model: config.model, max_tokens: maxTokens, system, messages };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000)
    });
    if (res.ok) return res.json();
    if ([429, 500, 502, 503, 529].includes(res.status) && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}
