/** @forge-plugin {"id":"vextra-ai","name":"Vextra AI","version":"2.0.0","description":"Chat with the AI model of your choice (Claude, OpenAI, Gemini, Groq, Ollama, LM Studio, OpenRouter or any OpenAI-compatible server) from a side panel. It can build whole games (scenes, objects, sprites, block-coded behaviours) and websites (files and folders) for you. Every ability has its own Deny / Ask / Allow permission. Has a ⚙ Configure button."} */
/** @forge-docs
 * ## Vextra AI
 * Open the **AI** panel in the sidebar, type a request and press **Send**. Choose the model and the permissions under **⚙ Configure** (a `plugin:Vextra AI` tab).
 *
 * ### What you see while it works
The AI first writes a short **Plan**, then does the work, then posts a **Done** summary (what now exists and how to try it). Grey lines are the individual steps (📄 read, ✏️ edited, 🎮 game change). **✨ thinking…** with a running timer stays on screen for as long as the model is working. Any code in an answer is shown in a **code block** (language label, line numbers, Copy). Press **?** in the panel for the short guide.
 *
 * ### It keeps working in the background
 * A request belongs to the tab it was started in. You can switch tabs, open other files or close the panel: the AI carries on in its own tab (the game or file it started with), the status bar shows **✨ AI · working…**, and a notice appears when it finishes or needs you. **■ Stop** ends it, **▶ Continue** resumes after a pause. (If it needs to open a preview while you are elsewhere it skips the preview.)
 *
 * ### Where game behaviours attach
 * A behaviour does nothing until it is attached to a designated target, and the AI is told to always choose one:
 * | Target | Used for | Needs |
 * |---|---|---|
 * | **entity** | one object: player controls, an enemy's AI, a coin | `"object":"Name"` |
 * | **scene** | one level: score, win/lose rules, spawners, the HUD | optional `"scene":"Level 2"` |
 * | **game** | the whole game, every scene (also scenes added later): pause menu, music, lives | – |
 * After every build the AI checks that nothing is left unattached; a behaviour that is attached to nothing is reported as a warning.
 *
 * ### The model list
 * In **⚙ Configure** the model box lists the models of the server you entered. Type the **Server URL** and the list loads: a key is only required for the built-in cloud addresses. For your own server (a proxy, vLLM, llama.cpp, a company gateway) the list is tried without a key and from the usual addresses (`/models`, `/v1/models`, `/api/tags`). If a server has no list, choose **Other…** and type the model name.
 *
 * ### Providers
 * | Provider | Needs | Notes |
 * |---|---|---|
 * | **Claude (Anthropic)** | API key | `https://api.anthropic.com` |
 * | **OpenAI** | API key | `https://api.openai.com/v1` |
 * | **Gemini (Google)** | API key | OpenAI-compatible endpoint of the Gemini API |
 * | **Groq** | API key | `https://api.groq.com/openai/v1` |
 * | **OpenRouter** | API key | many models behind one key |
 * | **Ollama Cloud** | API key | `https://ollama.com` (Ollama's hosted models; your prompts leave your computer) |
 * | **Ollama (local)** | nothing | the **local** Ollama on your computer (`http://localhost:11434`, its own `/api` – never ollama.com cloud) – no key, nothing leaves your machine |
 * | **LM Studio** | nothing | `http://localhost:1234/v1` |
 * | **Custom** | URL (+ key) | any server that speaks the OpenAI chat-completions format |
 *
 * ### Building for you
Ask for a result: *“Build me a 2D platformer with coins and enemies”*, *“Make a 3D maze game”*, *“Create a portfolio website with a gallery and contact form”*. The AI plans, then builds step by step: it opens a game, adds scenes, objects, sprites and ready-made assets, writes the **block logic** (it looks up the real blocks and ports first), attaches behaviours, then checks the result and fixes problems. Each game change is **one undo step** (Ctrl+Z). For websites it creates, edits, moves and deletes files and folders in the open folder and opens `index.html`.
Use the **Builder** preset in the panel for big jobs (it may take 20–30 steps). Raise *Max actions per request* if it stops early and just say “continue”.

### Permissions
Each ability is **Deny**, **Ask** (you see what will happen and approve it) or **Allow**. Presets: **Chat only**, **Assist** (reads freely, asks before changing anything), **Agent** (changes without asking, asks before deleting) and **Builder** (everything allowed).
 *
 * | Ability | What the AI may do |
 * |---|---|
 * | **Read project** | list/read files, read the open file, summarise the game, look up blocks, objects and ready-made assets |
 * | **Edit open file** | replace or insert text in the editor you have open |
 * | **Create & edit files** | create folders, create or overwrite files inside the open folder (never outside it, never `.env`, keys, `.git` or `node_modules`) |
 * | **Delete / move files & game items** | delete or move files, delete game objects and behaviours |
 * | **Build & change game** | open a new game; add or change scenes, objects, sprites, assets, behaviours and settings |
 *
 * ### Privacy
 * What you type and anything the AI reads is sent to the provider you chose. Files that look like secrets (`.env`, keys, certificates) are never read. The API key is stored in Vextra's local settings on this computer; leave it empty for local models.
 */
const PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', proto: 'anthropic', url: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', key: true },
  openai: { label: 'OpenAI', proto: 'openai', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', key: true },
  gemini: { label: 'Gemini (Google)', proto: 'openai', url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', key: true },
  groq: { label: 'Groq', proto: 'openai', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', key: true },
  openrouter: { label: 'OpenRouter', proto: 'openai', url: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4.5', key: true },
  mistral: { label: 'Mistral', proto: 'openai', url: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', key: true },
  deepseek: { label: 'DeepSeek', proto: 'openai', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: true },
  xai: { label: 'xAI (Grok)', proto: 'openai', url: 'https://api.x.ai/v1', model: 'grok-4', key: true },
  together: { label: 'Together AI', proto: 'openai', url: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', key: true },
  ollama: { label: 'Ollama (local)', proto: 'ollama', url: 'http://localhost:11434', model: 'llama3.1', key: false, local: true },
  ollamacloud: { label: 'Ollama Cloud', proto: 'ollama', url: 'https://ollama.com', model: 'gpt-oss:120b', key: true },
  lmstudio: { label: 'LM Studio (local)', proto: 'openai', url: 'http://localhost:1234/v1', model: 'local-model', key: false, local: true },
  custom: { label: 'Custom (OpenAI-compatible)', proto: 'openai', url: '', model: '', key: true },
  customanthropic: { label: 'Custom (Anthropic-compatible)', proto: 'anthropic', url: '', model: '', key: true },
};
const PERMS = [['read', 'Read project'], ['editor', 'Edit open file'], ['files', 'Create & edit other files'], ['site', 'Build & change site'], ['delete', 'Delete / move files & game items'], ['game', 'Build & change game']];
const PRESETS = { chat: { read: 'deny', editor: 'deny', files: 'deny', site: 'deny', delete: 'deny', game: 'deny' }, assist: { read: 'allow', editor: 'ask', files: 'ask', site: 'ask', delete: 'ask', game: 'ask' }, agent: { read: 'allow', editor: 'allow', files: 'allow', site: 'allow', delete: 'ask', game: 'allow' }, builder: { read: 'allow', editor: 'allow', files: 'allow', site: 'allow', delete: 'allow', game: 'allow' } };
const DEF = { provider: 'ollama', baseUrl: '', model: '', apiKey: '', temperature: 0.4, maxTokens: 4096, ctxWindow: 0, timeout: 3600, maxSteps: 12, preset: 'assist', p_read: 'allow', p_editor: 'ask', p_files: 'ask', p_site: 'ask', p_delete: 'ask', p_game: 'ask', system: '' };
const cfg = () => { const c = Object.assign({}, DEF); for (const k of Object.keys(DEF)) { const v = forge.settings.get(k); if (v !== undefined && v !== null && v !== '') c[k] = v; } return c; };
const perm = (k) => cfg()['p_' + k];
const SECRET_FILE = /(^|\/)(\.env(\..*)?|id_rsa.*|.*\.(pem|key|p12|pfx|keystore|jks)|\.npmrc|\.netrc|credentials(\.json)?|secrets?\.(json|ya?ml))$/i;
const BAD_WRITE = /(^|\/)(\.git|node_modules)(\/|$)/i;
const safeRel = (p) => { p = String(p || '').replace(/\\/g, '/').replace(/^\.\//, ''); return p && !p.startsWith('/') && !/^[a-z]:/i.test(p) && !p.split('/').includes('..') && !p.includes('\0') ? p : null; };
const clip = (t, n = 12000) => (t.length > n ? t.slice(0, n) + `\n… [truncated ${t.length - n} characters]` : t);

/* ------------------------------------------------------------ model discovery */
/** Recognises the provider from the look of an API key */
const guessProvider = (k) => { k = String(k || '').trim(); return /^sk-ant-/.test(k) ? 'anthropic' : /^sk-or-/.test(k) ? 'openrouter' : /^gsk_/.test(k) ? 'groq' : /^AIza/.test(k) ? 'gemini' : /^sk-/.test(k) ? 'openai' : null; };
const NOT_CHAT = /embed|whisper|tts|dall-e|moderation|davinci|babbage|transcribe|audio|image|realtime|rerank/i;
/** Models the chosen provider offers: installed models for local servers, models the key can use for cloud ones. → [[id, label]] */
async function listModels(v) {
  const P = PROVIDERS[v.provider] || PROVIDERS.custom; const base = apiBase(v); if (!base) throw new Error('Enter the server URL first.');
  if (P.local && !isLoopback(base)) throw new Error(`${P.label} only connects to this computer – the address is not local.`);
  /* a key is only demanded for the built-in cloud addresses: with your own URL (a proxy, vLLM, llama.cpp, a company gateway…) the list is tried right away */
  const own = !!String(v.baseUrl || '').trim() && String(v.baseUrl).trim().replace(/\/+$/, '') !== String(P.url || '').replace(/\/+$/, '');
  if (P.key && !v.apiKey && !own) throw new Error('Enter the API key (or your own server URL) to see the models.');
  const key = String(v.apiKey || '').trim();
  const headers = P.local ? {} : P.proto === 'anthropic' ? Object.assign({ 'anthropic-version': '2023-06-01' }, key ? { 'x-api-key': key, authorization: 'Bearer ' + key } : {}) : key ? { authorization: 'Bearer ' + key } : {};
  let origin = base; try { origin = new URL(base).origin; } catch { /* keep base */ }
  const root = base.replace(/\/v1$/, '');
  /* every address a model list is commonly served from, most likely first */
  const urls = P.proto === 'anthropic' ? [base + '/v1/models?limit=100', base + '/models', origin + '/v1/models']
    : P.proto === 'ollama' ? [origin + '/api/tags', origin + '/v1/models']
      : [base + '/models', root + '/v1/models', origin + '/v1/models', origin + '/models', root + '/api/tags', origin + '/api/tags'];
  let j = null, status = 0, lastErr = null; const tried = new Set();
  for (const u of urls) {
    if (tried.has(u)) continue; tried.add(u);
    let r; try { r = await forge.net.request({ method: 'GET', url: u, headers, timeout: 15 }); } catch (e) { lastErr = e; if (!P.key || own) continue; throw new Error(e.message); }
    status = r.status; if (r.status === 401 || r.status === 403) throw new Error(key ? 'The server did not accept the API key.' : 'The server needs an API key – enter it above to see the models.');
    if (r.status >= 400) continue;
    try { j = JSON.parse(r.body); } catch { continue; } if (j) break;
  }
  if (!j) {
    if (lastErr && !status) throw new Error(P.key ? `Cannot reach ${base}: ${lastErr.message}` : `Cannot reach ${base}. Is ${P.label} running? (Ollama: start it with \`ollama serve\`; if it uses another address set OLLAMA_HOST or change the Server URL.)`);
    throw new Error(status ? `The server answered ${status} on its model-list addresses (it may not offer one). Pick “Other…” and type the model name.` : 'The server did not return a model list. Pick “Other…” and type the model name.');
  }
  const arr = Array.isArray(j) ? j : j.data || j.models || j.result || j.items || [];
  let ids = arr.map((m) => (typeof m === 'string' ? m : String(m.id || m.name || m.model || ''))).filter(Boolean).map((x) => x.replace(/^models\//, ''));
  if (P.proto === 'openai' || P.proto === 'ollama') ids = ids.filter((x) => !NOT_CHAT.test(x)); ids = [...new Set(ids)].sort();
  if (!ids.length) throw new Error(P.key ? 'The server returned no models. Pick “Other…” and type the model name.' : 'No models installed yet – e.g. run: ollama pull llama3.1');
  return { options: ids.map((x) => [x, x]), note: ids.length + ' model' + (ids.length === 1 ? '' : 's') + (P.key && !own ? ' available to this key' : own ? ' found on this server' : ' installed') };
}

/* ------------------------------------------------------------ model calls */
/** "http://localhost:11434" → "http://localhost:11434/v1" (OpenAI-style servers keep their API under /v1). Cloud presets already have their path. */
function apiBase(c) {
  const P = PROVIDERS[c.provider] || PROVIDERS.custom; let base = String(c.baseUrl || P.url).trim().replace(/\/+$/, ''); if (!base) return base;
  if (P.proto === 'anthropic') return base.replace(/\/v1$/, '');
  if (P.proto === 'ollama') { try { const u = new URL(base); return u.origin; } catch { return base; } } // Ollama's own API lives at the root: /api/chat, /api/tags
  base = base.replace(/\/(chat\/completions|models|api\/(chat|generate|tags))$/, ''); try { const u = new URL(base); if (!u.pathname || u.pathname === '/') base = base.replace(/\/+$/, '') + '/v1'; } catch { /* validated elsewhere */ } return base;
}
const isLoopback = (u) => { try { return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(new URL(u).hostname); } catch { return false; } };
const wantsJson = (c) => ['openai', 'ollama'].includes((PROVIDERS[c.provider] || PROVIDERS.custom).proto) && PERMS.some(([k]) => k !== 'read' && perm(k) !== 'deny');
/** Rough context size of a model, used by the usage bar (Settings → “Context window” overrides it). */
function ctxWindow(c) { const P = PROVIDERS[c.provider] || PROVIDERS.custom; if (+c.ctxWindow > 0) return +c.ctxWindow; if (P.proto === 'ollama') return 8192; if (P.proto === 'anthropic') return 200000; const m = String(c.model || '').toLowerCase(); return /gemini/.test(m) ? 1000000 : /gpt-4o|gpt-4\.1|gpt-5|llama-3\.[123]|deepseek|mistral-large|grok/.test(m) ? 128000 : /gpt-4-|32k/.test(m) ? 32000 : 32000; }
const usage = { last: { inT: 0, outT: 0, est: false } };
const estTokens = (t) => Math.ceil(String(t || '').length / 3.6);
/** A failure that means “could not reach the AI” (no internet, server down, time-out) rather than an answer from it */
const isNetErr = (e) => !!e && (e.netError || /network error|timed out|time-?out|10060|10061|10054|refused|unreachable|could not connect|cannot reach|dns|ENOTFOUND|ECONN|EAI_AGAIN|failed to fetch|connection (reset|closed|attempt)/i.test(String(e.message || e)));
/** Keep the conversation inside the model's context window (the “Context window” setting, or the provider default): oldest messages go first. */
function fitHistory(c, messages, system) {
  const win = ctxWindow(c), room = Math.max(512, win - Math.min(+c.maxTokens || 4096, Math.floor(win / 2)) - estTokens(system) - 200); let out = messages.map((m) => ({ role: m.role, content: String(m.content) })); const size = () => out.reduce((n, m) => n + estTokens(m.content) + 4, 0);
  while (out.length > 1 && size() > room) out.shift();
  while (out.length > 1 && out[0].role !== 'user') out.shift();
  if (size() > room && out.length) { const keep = Math.max(500, Math.floor(room * 3.6)); const last = out[out.length - 1]; if (last.content.length > keep) out[out.length - 1] = { role: last.role, content: last.content.slice(0, keep) + '\n…(shortened to fit the context window)' }; }
  return out;
}
async function callModel(c, messages, system) {
  const P = PROVIDERS[c.provider] || PROVIDERS.custom; let base = apiBase(c); const model = c.model;
  if (P.local && !isLoopback(base)) throw new Error(`${P.label} only connects to this computer (localhost). The address “${base}” is not local – choose “Ollama Cloud” or “Custom” to use a remote server.`);
  if (!base) throw new Error('Set the server URL in ⚙ Configure.'); if (!model) throw new Error('Pick a model in ⚙ Configure.'); if (P.key && !c.apiKey && !/^custom/.test(c.provider)) throw new Error(`${P.label} needs an API key – add it in ⚙ Configure.`);
  messages = fitHistory(c, messages, system); const maxOut = Math.max(64, Math.min(+c.maxTokens || 4096, Math.floor(ctxWindow(c) / 2))); const timeout = Math.max(10, Math.min(3600, +c.timeout || 3600)); const tryJson = wantsJson(c);
  /* Models differ in what they accept, so start with the best request and adapt to what the server complains about. */
  const opt = { json: tryJson, system: true, temp: true, maxName: 'max_tokens' };
  const send = (b) => {
    if (P.proto === 'anthropic') return forge.net.request({ method: 'POST', url: b + '/v1/messages', timeout, headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(Object.assign({ model, max_tokens: maxOut, system, messages }, opt.temp ? { temperature: +c.temperature } : {})) });
    const msgs = opt.system ? [{ role: 'system', content: system }, ...messages] : [{ role: 'user', content: '[Instructions]\n' + system }, { role: 'assistant', content: 'Understood.' }, ...messages];
    if (P.proto === 'ollama') return forge.net.request({ method: 'POST', url: b + '/api/chat', timeout, headers: Object.assign({ 'content-type': 'application/json' }, c.apiKey && !P.local ? { authorization: 'Bearer ' + c.apiKey } : {}), body: JSON.stringify({ model, stream: false, ...(opt.json ? { format: 'json' } : {}), options: Object.assign({ num_predict: maxOut, num_ctx: ctxWindow(c) }, opt.temp ? { temperature: +c.temperature } : {}), messages: msgs }) });
    const headers = { 'content-type': 'application/json' }; if (c.apiKey && !P.local) headers.authorization = 'Bearer ' + c.apiKey;
    const body = Object.assign({ model, messages: msgs, [opt.maxName]: maxOut }, opt.temp ? { temperature: +c.temperature } : {}); if (opt.json) body.response_format = { type: 'json_object' };
    return forge.net.request({ method: 'POST', url: b + '/chat/completions', timeout, headers, body: JSON.stringify(body) });
  };
  let r, tried = 0;
  try {
    for (;;) {
      r = await send(base);
      if (r.status === 404 && P.proto === 'openai' && tried < 1) { const alt = /\/v1$/.test(base) ? base.replace(/\/v1$/, '') : base + '/v1'; const r2 = await send(alt); if (r2.status !== 404) { r = r2; base = alt; } }
      if (r.status < 400 || r.status >= 500 || r.status === 404 || r.status === 429 || ++tried > 4) break;
      const t = String(r.body).toLowerCase(); /* adapt, then retry */
      if (opt.json && /response_format|json_object|json mode|format/.test(t)) opt.json = false;
      else if (opt.maxName === 'max_tokens' && /max_completion_tokens/.test(t)) opt.maxName = 'max_completion_tokens';
      else if (opt.temp && /temperature/.test(t)) opt.temp = false;
      else if (opt.system && /system|developer|instruction/.test(t)) opt.system = false;
      else break;
    }
  } catch (e) { if (isNetErr(e)) { const er = new Error(`Could not connect to ${base}. ${e.message}`); er.netError = true; throw er; } throw e; }
  let j; try { j = JSON.parse(r.body); } catch { throw new Error(`HTTP ${r.status} from ${base}: ${String(r.body).slice(0, 200)}`); }
  if (r.status >= 400) { const m = (j.error && (j.error.message || j.error)) || j.message || 'request failed'; if (r.status === 404) throw new Error(`404 from ${base}: ${m}. ${P.key ? '' : `If the model "${model}" is not installed run: ollama pull ${model}`}`); const er = new Error(r.status === 429 ? `The provider is rate-limiting requests (429). ${m}` : `${r.status}: ${m}`); if (r.status >= 502 && r.status <= 504) er.netError = true; throw er; }
  const part = (x) => (typeof x === 'string' ? x : Array.isArray(x) ? x.map((y) => (typeof y === 'string' ? y : y && (y.text || y.content) || '')).join('') : '');
  let text = P.proto === 'anthropic' ? (j.content || []).map((b) => b.text || '').join('') : P.proto === 'ollama' ? part(j.message && j.message.content) : part(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim(); // reasoning models
  /* token usage, as reported by the provider (estimated when it does not say) */
  const u = j.usage || {}; const inT = u.input_tokens ?? u.prompt_tokens ?? j.prompt_eval_count, outT = u.output_tokens ?? u.completion_tokens ?? j.eval_count;
  usage.last = inT !== undefined ? { inT: +inT || 0, outT: +outT || 0, est: false } : { inT: estTokens(system) + messages.reduce((n, m) => n + estTokens(m.content), 0), outT: estTokens(text), est: true };
  if (!text) throw new Error('The model returned an empty answer.'); return text;
}

/** What the user is looking at right now, so "build this" works on the open game / file instead of starting something new */
async function contextBlock() {
  const lines = []; const root = forge.fs.root(); lines.push('Open folder: ' + (root || '(none)'));
  const ed = pin && pin.game();
  if (ed && perm('read') !== 'deny') {
    const g = ed.project, sc = g.scenes[ed.sceneIdx || 0]; lines.push(`THE USER HAS A ${sc && sc.dim === '3d' ? '3D' : '2D'} GAME OPEN: "${g.settings && g.settings.title}". Build INTO it with game_edit – do NOT call new_game. Current scene: "${sc && sc.name}" (${sc ? sc.objects.length : 0} objects). Scenes: ${g.scenes.map((x) => x.name + ' [' + x.dim + ', ' + x.objects.length + ' objects]').join('; ')}. Behaviours: ${Object.values(g.behaviors).map((b) => b.name).join(', ') || 'none yet'}. Sprites: ${Object.values(g.assets.sprites || {}).map((x) => x.name).join(', ') || 'none'}.`);
    if (sc && sc.objects.length) lines.push('Objects in the current scene: ' + sc.objects.slice(0, 40).map((o) => `${o.name}(${o.type})`).join(', '));
  } else { const path = pin && pin.kind === 'code' ? pin.path() : null; if (path) { const txt = pin.value(); lines.push(`The user has this file open: ${path} (${pin.lang()}, ${txt.length} chars). Edit/extend it (set_editor / write_file to the same path) rather than creating a new project. Its content${txt.length > 3500 ? ' (first 3500 chars)' : ''}:\n${txt.slice(0, 3500)}`); } else lines.push('No file or game is open: create files in the open folder (or new_game for a game).'); }
  return lines.join('\n');
}
/** {"say":"…","actions":[…]} (JSON mode) → { say, actions } or null */
function envelope(reply) { const v = tryJson(String(reply).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); return v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.actions) ? v : null; }

function systemPrompt(c, ctx) {
  const jsonMode = wantsJson(c);
  const abilities = PERMS.filter(([k]) => perm(k) !== 'deny').map(([k]) => k);
  return `You are the builder built into Vextra Studio, an app for web development and 2D/3D game making. When the user asks you to build something (a game, a website, a feature) you BUILD it yourself with actions – do not just describe it. Work in steps: say the plan in 2-4 lines, then act, check the results, continue until it is complete and playable/usable, then summarise in a few lines. Be concise, but never silent: the user must always understand what you are doing and why.

HOW TO TALK TO THE USER (every answer):
1. Before acting, a short "Plan:" of 2-5 bullets: what you will build and why.
2. Act (actions below).
3. After the results, a short "Done:" list of what now exists: the objects, the behaviours and WHERE each behaviour is attached, and how to try it (e.g. "press Play").
If something failed, say what failed and what you will try instead. Never change the project without saying so.
CODE FORMAT: whenever you show code or file content in your text, put it in a fenced block with its language (three backticks + js, html, css, json…). Never write code as loose text or inline. Machine blocks (vx-action, vx-file) stay exactly as described below.

${jsonMode ? `RESPONSE FORMAT (mandatory): reply with ONE JSON object and nothing else: {"say":"one or two short sentences","actions":[ {…action…}, {…action…} ]}. Put every step you want done in "actions" (up to 12). NEVER write a plan or step list for the user to follow – DO the work by returning the actions now. A file is {"action":"write_file","path":"index.html","content":"…"}. Example for a game that is open: {"say":"Adding the floor and player.","actions":[{"action":"game_edit","ops":[{"op":"add_object","type":"rect","name":"Floor","x":480,"y":520,"w":960,"h":40,"physics":"static"},{"op":"add_object","type":"rect","name":"Player","x":200,"y":300,"w":50,"h":50,"color":"#ff5577","tags":["player"],"physics":"dynamic"}]}]}. When the whole job is finished return an empty actions list and a summary in "say".\n` : ''}HOW TO ACT: write fenced blocks with the language "vx-action" containing one JSON object each (max 12 per answer), then stop and wait for the results. To write a whole file use a file block instead of JSON (no escaping needed):
~~~vx-file path="index.html"
...file content...
~~~
Abilities you currently have: ${abilities.join(', ') || 'none (just chat)'}.

READ (read): {"action":"list_files"} · {"action":"read_file","path":"rel/path"} · {"action":"get_editor"} · {"action":"game_summary"} · {"action":"list_object_types"} · {"action":"list_blocks","category":"optional"} · {"action":"block_info","id":"blockId"} · {"action":"asset_catalog","kind":"sprites|sounds|models|materials|shaders|animations"}
EDITOR (editor): {"action":"set_editor","text":"…"} · {"action":"insert_editor","text":"…"}
SITE (site): website files (html, css, js, ts, vue, svelte, json, svg, md…) are written with file blocks as above under this permission · {"action":"new_site","title":"My site","description":"…"} scaffolds index.html + style.css + script.js (skips files that exist) · {"action":"preview_site","path":"index.html"} shows the page (css/js inlined) so you can check it
FILES (files): any other file, written with file blocks as above · {"action":"make_dir","path":"css"} · {"action":"open_file","path":"index.html"}
DELETE (delete): {"action":"delete_file","path":"old.html"} · {"action":"move_file","from":"a.js","to":"src/a.js"}
GAME (game): {"action":"new_game","dim":"2d|3d"} opens a fresh game (do this first if no game is open) · {"action":"game_edit","ops":[ … ]} applies a batch of operations to the open game as ONE undo step. Ops:
 {"op":"set_game","title":"…","width":960,"height":540,"pixelArt":true}
 {"op":"add_scene","name":"Level 2","dim":"2d|3d","bg":"#10131a","gravity":{"x":0,"y":980,"z":0}} · {"op":"select_scene","name":"Level 1"} · {"op":"set_scene","bg":"#222","gravity":{…},"camera3d":{"mode":"follow|fps|orbit|fixed","fov":60,"distance":8,"height":2,"follow":"Player"},"camera2d":{"x":480,"y":270,"zoom":1}}
 {"op":"add_object","type":"rect|ellipse|triangle|sprite|text|light2d|empty|cube|sphere|cylinder|cone|plane|torus|capsule|pyramid|ramp|model|light|camera","name":"Player","x":0,"y":0,"z":0,"w":50,"h":50,"d":1,"rot":0,"color":"#6c8cff","alpha":1,"tags":["player"],"behaviors":["Player controls"],"props":{"sprite":"<sprite name>","emoji":"🚀","text":"Score: {score}","size":28},"physics":"dynamic|static|sensor|none (or an object {body,shape,bounce,friction,gravityScale,mass,fixedRotation,sensor})","vars":{}}  (2D: y grows DOWN, units are pixels, the default view is 960×540; 3D: y is up, units are metres)
 {"op":"modify_object","name":"Player","set":{"x":10,"color":"#fff","props":{…},"physics":{…}}} · {"op":"delete_object","name":"Old"} · {"op":"duplicate_object","name":"Coin","as":"Coin 2","x":300}
 {"op":"add_behavior","name":"Player controls","target":"entity","object":"Player","nodes":[{"id":"k1","type":"keyboard","params":{"key":"left","mode":"held"}},{"id":"v1","type":"velocity","params":{"mode":"set","x":"-240","y":""}}],"wires":[{"from":"k1","out":"out","to":"v1","in":"in"}]} – a block-coded behaviour (replaces one with the same name); with "target" it is created AND attached in one step. {"op":"delete_behavior","name":"…"} · {"op":"attach_behavior","behavior":"Name","target":"entity","object":"Player"} · {"behavior":"Name","target":"scene"} (or "scene":"Level 2") · {"behavior":"Name","target":"game"}
BEHAVIOURS AND WHERE THEY LIVE: a behaviour is a block-coded script and does NOTHING until it is attached to one of three designated targets. Always choose the target on purpose:
 • "entity" – logic for ONE object (needs "object":"Name"): player controls, an enemy's AI, a coin's pickup, a door.
 • "scene" – rules for ONE scene (the current one, or "scene":"Level 2"): score and win/lose rules, spawners, the HUD, timers, goals.
 • "game" – rules for the WHOLE game: attached to every scene, also to scenes you add later: pause menu, background music, global lives, restart key.
After building, call game_summary and check that every behaviour shows where it is attached; an unattached behaviour never runs.
 {"op":"add_asset","kind":"sprites|sounds|models|materials|shaders|animations","key":"<key from asset_catalog>"} – adds a ready-made asset · {"op":"add_sprite","name":"hero","rows":["..XX..","..XX.."],"palette":{"X":"#ff0000"},"scale":8} draws pixel art (rows of equal length, "." = transparent)
RULES: ALWAYS call list_blocks (and block_info for blocks you are unsure of) before writing a behaviour – use only real block ids, ports and params from the catalog. Logic is built from blocks: triggers (keyboard, collision, timer, always…) → actions (velocity, spawn, sound, loadScene, variable…). Give every object a clear name. Make games complete: player controls, goal/score, enemies or hazards, a HUD text, sounds, a win/lose rule. For 3D use a camera object or set_scene camera3d and a light. Use game_summary to check your work, fix any errors the results report, and only stop when it works. For websites: write complete, responsive, accessible HTML/CSS/JS files (separate files, relative links), open index.html when done.
CURRENT SITUATION:\n${ctx || ''}\n\nOnly use abilities you have. Paths are relative to the open folder. Never ask for or output secrets. When no action is needed, just answer normally.${c.system ? '\n\nUser instructions:\n' + c.system : ''}`;
}

/* ------------------------------------------------------------ actions */
async function approve(kind, what, detail) {
  const mode = perm(kind); if (mode === 'deny') return { ok: false, msg: `Permission "${kind}" is denied.` };
  if (mode === 'allow') return { ok: true };
  const yes = await forge.ui.confirm(`The AI wants to ${what}.\n\n${clip(detail || '', 1500)}`, 'Allow');
  return yes ? { ok: true } : { ok: false, msg: 'The user declined.' };
}
const join = (root, p) => root.replace(/[\\/]$/, '') + '/' + p;
const WEB_FILE = /\.(html?|css|scss|sass|less|js|mjs|cjs|jsx|ts|tsx|vue|svelte|json|svg|md|xml|webmanifest|php)$/i;
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const deny = (k) => `Denied: the "${k}" permission is off.`;

/* ---- game editing: all operations run on a copy of the project, then replace it as ONE undo step ---- */
const slug = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const NUM = ['x', 'y', 'z', 'w', 'h', 'd', 'rot', 'rx', 'ry', 'rz', 'alpha', 'order'];
function layout(nodes, wires) {
  const incoming = new Map(nodes.map((n) => [n.id, 0])); for (const w of wires) incoming.set(w.to, (incoming.get(w.to) || 0) + 1); const depth = new Map(); let frontier = nodes.filter((n) => !incoming.get(n.id)).map((n) => n.id); frontier.forEach((id) => depth.set(id, 0));
  for (let guard = 0; frontier.length && guard < 60; guard++) { const next = []; for (const id of frontier) for (const w of wires) if (w.from === id && (depth.get(w.to) ?? -1) < depth.get(id) + 1) { depth.set(w.to, depth.get(id) + 1); next.push(w.to); } frontier = next; }
  const rows = {}; for (const n of nodes) { if (n.x !== undefined && n.y !== undefined) continue; const d = depth.get(n.id) || 0; rows[d] = (rows[d] || 0) + 1; n.x = 40 + d * 290; n.y = 40 + (rows[d] - 1) * 130; }
}
function resolveSprite(P, ref) { if (!ref) return ''; const sp = P.assets.sprites || {}; if (sp[ref]) return ref; const hit = Object.values(sp).find((a) => slug(a.name) === slug(ref) || slug(a.id) === slug(ref)); return hit ? hit.id : ''; }
function findObj(sc, name) { return sc.objects.find((o) => o.name === name) || sc.objects.find((o) => slug(o.name) === slug(name)); }
function findBeh(P, name) { return Object.values(P.behaviors).find((b) => b.name === name || b.id === name) || Object.values(P.behaviors).find((b) => slug(b.name) === slug(name)); }
function physicsOf(v, old) { if (v === undefined) return old; if (typeof v === 'string') return v === 'none' ? { body: 'none' } : v === 'sensor' ? { body: 'static', shape: 'box', sensor: true, bounce: 0, friction: 0, gravityScale: 1, mass: 1 } : Object.assign({ shape: 'box', bounce: 0, friction: 0.3, gravityScale: 1, mass: 1 }, { body: v }, v === 'dynamic' ? { fixedRotation: true } : {}); return Object.assign({}, old || {}, v); }
/** Attaches a behaviour to its designated target: entity (one object), scene (one scene) or game (every scene, also future ones). */
function attach(P, b, op, scene) {
  const t = String(op.target || (op.object ? 'entity' : op.scene ? 'scene' : '')).toLowerCase();
  if (t === 'game') { b.scope = 'game'; for (const sc of P.scenes) { sc.behaviors = sc.behaviors || []; if (!sc.behaviors.includes(b.id)) sc.behaviors.push(b.id); } return `attached "${b.name}" to the GAME (all ${P.scenes.length} scene${P.scenes.length === 1 ? '' : 's'}, and any scene added later)`; }
  if (t === 'scene') { const sc = typeof op.scene === 'string' ? P.scenes.find((x) => x.name === op.scene || slug(x.name) === slug(op.scene)) : scene(); if (!sc) throw new Error('no scene named ' + op.scene); sc.behaviors = sc.behaviors || []; if (!sc.behaviors.includes(b.id)) sc.behaviors.push(b.id); return `attached "${b.name}" to the SCENE "${sc.name}"`; }
  if (t === 'entity') { const o = findObj(scene(), op.object); if (!o) throw new Error('no object named ' + op.object + ' (target "entity" needs "object")'); o.behaviors = o.behaviors || []; if (!o.behaviors.includes(b.id)) o.behaviors.push(b.id); return `attached "${b.name}" to the ENTITY "${o.name}"`; }
  throw new Error('attach_behavior needs "target": "entity" (with "object"), "scene" or "game"');
}
function applyOps(P, ops, st) {
  const K = forge.game.kit(), GP = K.GP; const out = [];
  const scene = () => P.scenes[st.si] || P.scenes[0];
  for (const [n, op] of ops.entries()) {
    const tag = `#${n + 1} ${op.op || '?'}`;
    try {
      switch (op.op) {
        case 'set_game': { const S = P.settings; for (const k of ['title', 'width', 'height', 'bg', 'pixelArt', 'fps']) if (op[k] !== undefined) S[k] = op[k]; out.push(`${tag}: ok`); break; }
        case 'add_scene': { const sc = GP.blankScene(op.dim === '3d' ? '3d' : '2d', String(op.name || 'Scene ' + (P.scenes.length + 1))); if (op.bg) sc.bg = op.bg; if (op.gravity) sc.gravity = Object.assign(sc.gravity, op.gravity); sc.behaviors = Object.values(P.behaviors).filter((b) => b.scope === 'game').map((b) => b.id); P.scenes.push(sc); st.si = P.scenes.length - 1; out.push(`${tag}: scene "${sc.name}" (${sc.dim}) added and selected`); break; }
        case 'select_scene': { const i = P.scenes.findIndex((x) => x.name === op.name || slug(x.name) === slug(op.name)); if (i < 0) throw new Error('no scene named ' + op.name); st.si = i; out.push(`${tag}: ok`); break; }
        case 'set_scene': { const sc = scene(); if (op.name) sc.name = op.name; if (op.bg) sc.bg = op.bg; if (op.gravity) sc.gravity = Object.assign(sc.gravity || {}, op.gravity); if (op.camera2d) sc.camera2d = Object.assign(sc.camera2d || {}, op.camera2d); if (op.camera3d) { const c = Object.assign({}, op.camera3d); if (typeof c.follow === 'string') { sc.camera3d = Object.assign(sc.camera3d || {}, c); sc.camera3d.followName = c.follow; delete sc.camera3d.follow; } else sc.camera3d = Object.assign(sc.camera3d || {}, c); } out.push(`${tag}: ok`); break; }
        case 'add_object': {
          const sc = scene(), is3 = sc.dim === '3d'; if (!GP.type(op.type)) throw new Error(`unknown object type "${op.type}" – see list_object_types`); if (GP.type(op.type).dim === '3d' && !is3) throw new Error(`"${op.type}" is 3D but the scene "${sc.name}" is 2D`); if (GP.type(op.type).dim === '2d' && is3) throw new Error(`"${op.type}" is 2D but the scene "${sc.name}" is 3D`);
          const o = GP.newObject(op.type, sc.dim, +op.x || 0, +op.y || 0, +op.z || 0, sc.objects.map((x) => x.name)); if (op.name) { let nm = String(op.name).slice(0, 40), k = 1; const base = nm; while (sc.objects.some((x) => x.name === nm)) nm = base + ' ' + ++k; o.name = nm; }
          for (const k of NUM) if (op[k] !== undefined && !isNaN(+op[k])) o[k] = +op[k]; if (op.color) o.color = op.color; if (op.visible === false) o.visible = false; if (Array.isArray(op.tags)) o.tags = op.tags.map(String); if (op.vars && typeof op.vars === 'object') o.vars = op.vars;
          if (op.props && typeof op.props === 'object') Object.assign(o.props, op.props); if (o.props && 'sprite' in o.props && o.props.sprite) { const id = resolveSprite(P, o.props.sprite); if (!id) throw new Error(`sprite "${o.props.sprite}" does not exist – add_sprite or add_asset first`); o.props.sprite = id; }
          if (op.type === 'model' && o.props.model && !P.assets.models[o.props.model]) { const m = Object.values(P.assets.models).find((a) => slug(a.name) === slug(o.props.model)); if (m) o.props.model = m.id; }
          o.physics = physicsOf(op.physics, o.physics); const miss = []; o.behaviors = (op.behaviors || []).map((b) => { const f = findBeh(P, b); if (!f) miss.push(b); return f && f.id; }).filter(Boolean); sc.objects.push(o);
          out.push(`${tag}: added "${o.name}"${miss.length ? ' (unknown behaviours skipped: ' + miss.join(', ') + ' – create them with add_behavior first, then attach_behavior)' : ''}`); break;
        }
        case 'modify_object': { const o = findObj(scene(), op.name); if (!o) throw new Error('no object named ' + op.name); const set = op.set || {}; for (const [k, v] of Object.entries(set)) { if (k === 'props') { Object.assign(o.props, v); if (v.sprite) o.props.sprite = resolveSprite(P, v.sprite) || v.sprite; } else if (k === 'physics') o.physics = physicsOf(v, o.physics); else if (k === 'tags') o.tags = [].concat(v).map(String); else if (k === 'name') o.name = String(v); else if (k === 'vars') Object.assign(o.vars, v); else if (k === 'behaviors') o.behaviors = [].concat(v).map((b) => findBeh(P, b)).filter(Boolean).map((b) => b.id); else if (NUM.includes(k)) o[k] = +v; else if (['color', 'visible', 'enabled'].includes(k)) o[k] = v; } out.push(`${tag}: modified "${o.name}"`); break; }
        case 'delete_object': { const sc = scene(), o = findObj(sc, op.name); if (!o) throw new Error('no object named ' + op.name); sc.objects.splice(sc.objects.indexOf(o), 1); out.push(`${tag}: deleted "${o.name}"`); break; }
        case 'duplicate_object': { const sc = scene(), o = findObj(sc, op.name); if (!o) throw new Error('no object named ' + op.name); const c = GP.clone(o); c.id = GP.uid(); c.name = op.as || o.name + ' copy'; for (const k of NUM) if (op[k] !== undefined) c[k] = +op[k]; sc.objects.push(c); out.push(`${tag}: duplicated as "${c.name}"`); break; }
        case 'add_behavior': {
          const nodes = (op.nodes || []).map((x) => ({ id: String(x.id), type: x.type, params: x.params || {}, x: x.x, y: x.y })), wires = (op.wires || []).map((w) => ({ from: String(w.from), out: w.out || 'out', to: String(w.to), in: w.in || 'in' })); const ids = new Set(nodes.map((x) => x.id)); const probs = [];
          if (!nodes.length) throw new Error('a behaviour needs at least one node'); if (ids.size !== nodes.length) throw new Error('duplicate node ids');
          for (const nd of nodes) { const d = K.blocks[nd.type]; if (!d) { probs.push(`unknown block "${nd.type}" (node ${nd.id}) – use list_blocks`); continue; } const known = new Set((d.params || []).map((q) => q.key)); for (const k of Object.keys(nd.params)) if (!known.has(k)) probs.push(`block ${nd.type}: unknown param "${k}" (valid: ${[...known].join(', ')})`); }
          const good = []; for (const w of wires) { const a = nodes.find((q) => q.id === w.from), b = nodes.find((q) => q.id === w.to); if (!a || !b) { probs.push(`wire ${w.from}→${w.to}: node not found`); continue; } const da = K.blocks[a.type], db = K.blocks[b.type]; if (!da || !db) continue;
            const oa = K.ports(da, Object.assign(K.paramDefaults(da), a.params), a).outputs.map((q) => q.id), ib = K.ports(db, Object.assign(K.paramDefaults(db), b.params), b).inputs.map((q) => q.id); if (!oa.includes(w.out)) { probs.push(`wire ${w.from}→${w.to}: block ${a.type} has no output "${w.out}" (outputs: ${oa.join(', ')})`); continue; } if (!ib.includes(w.in)) { probs.push(`wire ${w.from}→${w.to}: block ${b.type} has no input "${w.in}" (inputs: ${ib.join(', ')})`); continue; } good.push(w); }
          if (probs.some((q) => /unknown block|node not found|duplicate/.test(q))) throw new Error(probs.join('; '));
          layout(nodes, good); const old = findBeh(P, op.name); const b = old || GP.newBehavior(String(op.name || 'Behaviour')); b.mode = 'graph'; b.graph = { nodes, wires: good }; if (!old) P.behaviors[b.id] = b; out.push(`${tag}: behaviour "${b.name}" ${old ? 'replaced' : 'created'} (${nodes.length} blocks, ${good.length} wires)${probs.length ? ' – WARNINGS: ' + probs.join('; ') : ''}`);
          if (op.target || op.object || op.scene) out.push(`${tag}: ` + attach(P, b, op, scene)); break;
        }
        case 'delete_behavior': { const b = findBeh(P, op.name); if (!b) throw new Error('no behaviour named ' + op.name); delete P.behaviors[b.id]; for (const sc of P.scenes) { sc.behaviors = (sc.behaviors || []).filter((x) => x !== b.id); for (const o of sc.objects) o.behaviors = (o.behaviors || []).filter((x) => x !== b.id); } out.push(`${tag}: deleted behaviour "${b.name}"`); break; }
        case 'attach_behavior': { const b = findBeh(P, op.behavior); if (!b) throw new Error('no behaviour named ' + op.behavior); out.push(`${tag}: ` + attach(P, b, op, scene)); break; }
        case 'add_asset': { const a = VX.defaultAssets.add(P, op.kind, op.key); if (!a) throw new Error(`no ${op.kind} asset "${op.key}" – see asset_catalog`); out.push(`${tag}: added ${op.kind} "${a.name}" (id ${a.id})`); break; }
        case 'add_sprite': {
          const rows = (op.rows || []).map(String), w = Math.max(...rows.map((r) => r.length)), h = rows.length; if (!h || !w || w > 128 || h > 128) throw new Error('sprite rows must be 1–128 characters wide and tall'); const pal = op.palette || {}; const url = GP.spriteFromRows(rows.map((r) => r.padEnd(w, '.')), pal, Math.max(1, Math.min(16, +op.scale || 4)));
          const sc = Math.max(1, Math.min(16, +op.scale || 4)); const a = { id: GP.uid('spr'), name: String(op.name || 'sprite'), w: w * sc, h: h * sc, frames: [url], fps: 8, anims: {} }; P.assets.sprites[a.id] = a; out.push(`${tag}: sprite "${a.name}" ${a.w}×${a.h} created`); break;
        }
        default: throw new Error('unknown op "' + op.op + '"');
      }
    } catch (e) { out.push(`${tag}: ERROR ${e.message}`); }
  }
  return out;
}
async function gameEdit(ops) {
  const ed = pin && pin.game(); if (!ed) return 'No game is open in the tab this request started in – use new_game first.'; if (!Array.isArray(ops) || !ops.length) return 'ops must be a non-empty list.';
  const deletes = ops.filter((o) => /^delete_/.test(o.op)); if (deletes.length) { const ok = await approve('delete', `delete from the game: ${deletes.map((d) => d.op.replace('delete_', '') + ' ' + d.name).join(', ')}`, ''); if (!ok.ok) ops = ops.filter((o) => !/^delete_/.test(o.op)); }
  const ok = await approve('game', `change the game (${ops.length} step${ops.length === 1 ? '' : 's'})`, ops.map((o) => `• ${o.op}${o.name ? ' ' + o.name : ''}${o.type ? ' (' + o.type + ')' : ''}`).join('\n')); if (!ok.ok) return ok.msg;
  const P = JSON.parse(JSON.stringify(ed.project)); const st = { si: ed.sceneIdx || 0 }; const res = applyOps(P, ops, st); const before = ed.last, json = JSON.stringify(P);
  P.settings = P.settings || {}; ed.sceneIdx = st.si; ed.restore(json); ed.undoStack.push(before); if (ed.undoStack.length > 80) ed.undoStack.shift(); ed.redoStack = []; ed.last = json; if (ed.setView) { /* keep the current view */ }
  const used = new Set(); for (const sc of P.scenes) { (sc.behaviors || []).forEach((x) => used.add(x)); for (const o of sc.objects) (o.behaviors || []).forEach((x) => used.add(x)); }
  const loose = Object.values(P.behaviors).filter((b) => !used.has(b.id)).map((b) => b.name); if (loose.length) res.push(`WARNING: not attached to anything, so it will never run: ${loose.join(', ')} – use attach_behavior with target entity, scene or game.`);
  return res.join('\n') + `\nDone. Scenes: ${P.scenes.map((s) => s.name + ' (' + s.objects.length + ' objects)').join(', ')}. Behaviours: ${Object.values(P.behaviors).map((b) => b.name).join(', ') || 'none'}.`;
}
function blockLine(d, full) {
  const K = forge.game.kit(); const pr = K.paramDefaults(d); let ports = { inputs: [], outputs: [] }; try { ports = K.ports(d, pr, { params: pr }); } catch { /* dynamic ports */ }
  const params = (d.params || []).map((q) => `${q.key}(${q.type}${q.options ? ':' + q.options.map((o) => (Array.isArray(o) ? o[0] : o)).slice(0, 14).join('|') : ''}${q.def !== undefined && q.def !== '' ? '=' + q.def : ''})`).join(', ');
  return full ? `${d.id} [${d.cat}] ${d.label}\n${d.desc}\ninputs: ${ports.inputs.map((q) => q.id).join(', ') || '–'}\noutputs: ${ports.outputs.map((q) => q.id).join(', ') || '–'}\nparams: ${params || '–'}` : `${d.id} – ${d.label}: ${String(d.desc || '').split(/(?<=[.!])\s/)[0].slice(0, 110)} | in: ${ports.inputs.map((q) => q.id).join(',') || '–'} | out: ${ports.outputs.map((q) => q.id).join(',') || '–'}`;
}

async function runAction(a, log) {
  const root = forge.fs.root();
  try {
    switch (a.action) {
      case 'list_files': { if (perm('read') === 'deny') return deny('read'); if (!root) return 'No folder is open.'; const l = (await forge.fs.list(600)).filter((f) => !SECRET_FILE.test(f)); log('📂 listed files'); return l.join('\n') || '(empty)'; }
      case 'read_file': { if (perm('read') === 'deny') return deny('read'); const p = safeRel(a.path); if (!root || !p) return 'Invalid path.'; if (SECRET_FILE.test(p)) return 'Refused: that file may contain secrets.'; log('📄 read ' + p); return clip(await forge.fs.readFile(join(root, p))); }
      case 'get_editor': { if (perm('read') === 'deny') return deny('read'); log('📄 read the open file'); return clip(pin && pin.kind === 'code' ? pin.value() : '') || '(no text editor is open)'; }
      case 'game_summary': {
        if (perm('read') === 'deny') return deny('read'); const g = pin && pin.game() ? pin.game().project : null; if (!g) return 'No game is open.'; log('🎮 read game summary'); const bn = (id) => (g.behaviors[id] && g.behaviors[id].name) || id;
        return JSON.stringify({ title: g.settings && g.settings.title, scenes: g.scenes.map((s) => ({ name: s.name, dim: s.dim, bg: s.bg, behaviors: (s.behaviors || []).map(bn), objects: s.objects.map((o) => ({ name: o.name, type: o.type, x: o.x, y: o.y, z: o.z, w: o.w, h: o.h, tags: o.tags, behaviors: (o.behaviors || []).map(bn), physics: o.physics && o.physics.body !== 'none' ? o.physics.body : undefined })) })), behaviors: Object.values(g.behaviors || {}).map((b) => ({ name: b.name, attachedTo: [].concat(g.scenes.filter((s) => (s.behaviors || []).includes(b.id)).map((s) => (b.scope === 'game' ? 'game' : 'scene:' + s.name)), ...g.scenes.map((s) => s.objects.filter((o) => (o.behaviors || []).includes(b.id)).map((o) => 'entity:' + o.name))).filter((x, i, a) => a.indexOf(x) === i && !(x.startsWith('scene:') && b.scope === 'game')).join(', ') || 'NOTHING (never runs)', blocks: b.graph ? b.graph.nodes.map((n) => n.type).join(',') : 'code' })), sprites: Object.values(g.assets.sprites || {}).map((s) => s.name), sounds: Object.values(g.assets.sounds || {}).map((s) => s.name), models: Object.values(g.assets.models || {}).map((s) => s.name) });
      }
      case 'list_object_types': { if (perm('read') === 'deny') return deny('read'); return forge.game.kit().GP.types().map((t) => `${t.type} (${t.dim}) – ${t.label}`).join('\n'); }
      case 'list_blocks': { if (perm('read') === 'deny') return deny('read'); const K = forge.game.kit(); const all = Object.values(K.blocks); if (!a.category) { const cats = {}; for (const d of all) (cats[d.cat] ||= []).push(d.id); log('🧱 listed blocks'); return Object.entries(cats).map(([c, ids]) => `${c}: ${ids.join(', ')}`).join('\n') + '\n(call list_blocks with a "category" for ports and params, or block_info for one block)'; } const l = all.filter((d) => d.cat === a.category); log('🧱 listed ' + a.category + ' blocks'); return l.length ? l.map((d) => blockLine(d, false) + '\n   params: ' + (d.params || []).map((q) => q.key).join(', ')).join('\n') : 'No such category.'; }
      case 'block_info': { if (perm('read') === 'deny') return deny('read'); const d = forge.game.kit().blocks[a.id]; if (!d) return 'No block with that id.'; log('🧱 block ' + a.id); return blockLine(d, true); }
      case 'asset_catalog': { if (perm('read') === 'deny') return deny('read'); const l = VX.defaultAssets.catalog(a.kind || 'sprites'); log('🗂 asset catalog ' + (a.kind || 'sprites')); return l.map((e) => e.key + (e.tag ? ' [' + e.tag + ']' : '')).join(', ') || 'Unknown kind.'; }
      case 'set_editor': case 'insert_editor': {
        const t = String(a.text ?? ''); const ok = await approve('editor', a.action === 'set_editor' ? 'replace the whole open file' : 'insert text into the open file', t); if (!ok.ok) return ok.msg;
        if (!pin || pin.kind !== 'code' || !pin.alive()) return 'There is no text file open in the tab this request started in.'; if (a.action === 'set_editor') pin.setValue(t); else pin.insert(t); log('✏️ edited ' + (pin.path() || 'the open file')); return 'Done.';
      }
      case 'write_file': {
        const p = safeRel(a.path); if (!root || !p) return 'Invalid path or no folder open.'; if (SECRET_FILE.test(p) || BAD_WRITE.test(p)) return 'Refused: that location is protected.';
        const existed = await forge.fs.exists(join(root, p)).catch(() => false); const ok = await approve(WEB_FILE.test(p) ? 'site' : 'files', (existed ? 'overwrite ' : 'create ') + p, String(a.content ?? '')); if (!ok.ok) return ok.msg; await forge.fs.writeFile(join(root, p), String(a.content ?? '')); log((existed ? '💾 updated ' : '💾 created ') + p); return (existed ? 'Updated ' : 'Created ') + p + ` (${String(a.content ?? '').length} characters).`;
      }
      case 'make_dir': { const p = safeRel(a.path); if (!root || !p || BAD_WRITE.test(p)) return 'Invalid path.'; const ok = await approve(perm('site') !== 'deny' ? 'site' : 'files', 'create the folder ' + p, ''); if (!ok.ok) return ok.msg; await forge.fs.mkdir(p); log('📁 created folder ' + p); return 'Folder ready.'; }
      case 'new_site': {
        const t = esc(String(a.title || 'My site').slice(0, 80)), d = esc(String(a.description || '').slice(0, 200)); const ok = await approve('site', 'scaffold a website (index.html, style.css, script.js)', t); if (!ok.ok) return ok.msg; if (!root) return 'No folder is open.';
        const files = { 'index.html': `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${t}</title>\n  <meta name="description" content="${d}">\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <header><h1>${t}</h1></header>\n  <main></main>\n  <footer></footer>\n  <script src="script.js"></script>\n</body>\n</html>\n`, 'style.css': `*{box-sizing:border-box}\nbody{margin:0;font-family:system-ui,sans-serif;line-height:1.5}\n`, 'script.js': `// ${t}\n` }; const made = [], kept = [];
        for (const [f, c] of Object.entries(files)) { if (await forge.fs.exists(join(root, f)).catch(() => false)) kept.push(f); else { await forge.fs.writeFile(join(root, f), c); made.push(f); } } log('🌐 scaffolded the site'); await forge.fs.open('index.html').catch(() => {}); return `Created: ${made.join(', ') || 'nothing'}${kept.length ? '. Already existed (left untouched): ' + kept.join(', ') : ''}. Now fill them in with file blocks.`;
      }
      case 'preview_site': {
        if (perm('site') === 'deny') return deny('site'); const p = safeRel(a.path || 'index.html'); if (!root || !p) return 'Invalid path or no folder open.'; let html; try { html = await forge.fs.readFile(join(root, p)); } catch { return 'File not found: ' + p; }
        const dir = p.split('/').slice(0, -1).join('/'); const rd = async (r) => { try { return await forge.fs.readFile(join(root, (dir ? dir + '/' : '') + r.replace(/^\.?\//, ''))); } catch { return null; } };
        const css = [...html.matchAll(/<link[^>]+href=["']([^"':]+\.css)["'][^>]*>/gi)], js = [...html.matchAll(/<script[^>]+src=["']([^"':]+\.js)["'][^>]*><\/script[^>]*>/gi)];
        for (const m of css) { const c = await rd(m[1]); if (c !== null) html = html.replace(m[0], () => `<style>${c}</style>`); } for (const m of js) { const c = await rd(m[1]); if (c !== null) html = html.replace(m[0], () => `<script>${c.replace(/<\/script/gi, '<\\/script')}</script>`); }
        if (pin && pin.alive() && !pin.isActive()) { log('👁 checked ' + p + ' (not shown: you are in another tab)'); return `Checked ${p} (${html.length} characters). It is not shown because the user is working in another tab; check your markup for mistakes.`; } forge.ui.preview(html, p); log('👁 previewed ' + p); return `Previewed ${p} (${html.length} characters). The user sees it; check your markup for mistakes.`;
      }
      case 'open_file': { const p = safeRel(a.path); if (!root || !p) return 'Invalid path.'; if (perm('read') === 'deny') return deny('read'); await forge.fs.open(p); log('👁 opened ' + p); return 'Opened.'; }
      case 'delete_file': { const p = safeRel(a.path); if (!root || !p || BAD_WRITE.test(p) || SECRET_FILE.test(p)) return 'Refused: invalid or protected path.'; const ok = await approve('delete', 'DELETE ' + p, 'This cannot be undone.'); if (!ok.ok) return ok.msg; await forge.fs.remove(p); log('🗑 deleted ' + p); return 'Deleted ' + p + '.'; }
      case 'move_file': {
        const f = safeRel(a.from), t = safeRel(a.to); if (!root || !f || !t || BAD_WRITE.test(f + '/' + t) || SECRET_FILE.test(f) || SECRET_FILE.test(t)) return 'Refused: invalid or protected path.'; const ok = await approve('delete', `move ${f} → ${t}`, ''); if (!ok.ok) return ok.msg;
        if (await forge.fs.exists(join(root, t)).catch(() => false)) return 'The destination already exists.'; const txt = await forge.fs.readFile(join(root, f)); const dir = t.split('/').slice(0, -1).join('/'); if (dir) await forge.fs.mkdir(dir); await forge.fs.writeFile(join(root, t), txt); await forge.fs.remove(f); log(`📦 moved ${f} → ${t}`); return 'Moved.';
      }
      case 'new_game': { if (perm('game') === 'deny') return deny('game'); const ok = await approve('game', `open a new ${a.dim === '3d' ? '3D' : '2D'} game`, ''); if (!ok.ok) return ok.msg; const ed = await forge.game.newGame(a.dim); pin = forge.pin(); log('🎮 new game'); return ed ? `A new ${a.dim === '3d' ? '3D' : '2D'} game is open. It contains a default scene${a.dim === '3d' ? ' with a light and camera' : ''}. Use game_edit.` : 'Could not open a game.'; }
      case 'game_edit': { const r = await gameEdit(a.ops); log('🎮 game_edit (' + ((a.ops || []).length) + ' ops)'); return clip(r, 6000); }
      default: return 'Unknown action: ' + a.action;
    }
  } catch (e) { return 'Error: ' + e.message; }
}
/* Small / local models are sloppy about the fence name (```vx, ```json, none at all…), so accept any fenced block – or bare JSON – that holds an object with an "action". */
const tryJson = (t) => { t = String(t).trim(); for (const v of [t, t.replace(/,\s*([}\]])/g, '$1')]) { try { return JSON.parse(v); } catch { /* next */ } } return undefined; };
function balancedObjects(text) { const out = []; for (let i = 0; i < text.length; i++) { if (text[i] !== '{') continue; let d = 0, str = false, esc = false; for (let k = i; k < text.length; k++) { const c = text[k]; if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; } if (c === '"') str = true; else if (c === '{') d++; else if (c === '}' && --d === 0) { out.push(text.slice(i, k + 1)); i = k; break; } } } return out; }
const asActions = (v) => (Array.isArray(v) ? v : [v]).filter((x) => x && typeof x === 'object' && typeof x.action === 'string');
const FENCE = /(`{3,}|~{3,})([^\n`~]*)\n([\s\S]*?)\n?\1/g;
const parseActions = (text) => {
  const out = []; let m; FENCE.lastIndex = 0; let rest = text;
  while ((m = FENCE.exec(text))) {
    const lang = m[2].trim(), body = m[3]; const pm = /^vx-file\s+path=["']?([^"'\s]+)["']?/.exec(lang);
    if (pm) { out.push({ action: 'write_file', path: pm[1], content: body }); rest = rest.replace(m[0], ''); continue; }
    const v = tryJson(body); const a = v !== undefined ? asActions(v) : []; if (a.length) { out.push(...a); rest = rest.replace(m[0], ''); } else if (/^vx/i.test(lang)) { out.push({ action: '__badjson' }); rest = rest.replace(m[0], ''); }
  }
  if (!out.length) for (const o of balancedObjects(rest)) { if (!/"action"\s*:/.test(o)) continue; const v = tryJson(o); if (v !== undefined) out.push(...asActions(v)); }
  /* models often write a game operation as the action itself ({"action":"add_object",…}) – fold those into one game_edit */
  const GAME_OPS = new Set(['set_game', 'add_scene', 'select_scene', 'set_scene', 'add_object', 'modify_object', 'delete_object', 'duplicate_object', 'add_behavior', 'delete_behavior', 'attach_behavior', 'add_asset', 'add_sprite']); const merged = [];
  for (const a of out) { if (GAME_OPS.has(a.action)) { const op = Object.assign({}, a, { op: a.action }); delete op.action; const last = merged[merged.length - 1]; if (last && last.__fold) last.ops.push(op); else merged.push({ action: 'game_edit', ops: [op], __fold: true }); } else merged.push(a); }
  return merged.slice(0, 40);
};
const stripActions = (t) => { let r = String(t).replace(FENCE, (all, f, lang, body) => (/^vx/i.test(lang.trim()) || (tryJson(body) !== undefined && asActions(tryJson(body)).length) ? '' : all)); for (const o of balancedObjects(r)) if (/"action"\s*:/.test(o) && tryJson(o) !== undefined) r = r.replace(o, ''); return r.replace(/\n{3,}/g, '\n\n').trim(); };

/* ------------------------------------------------------------ chat session */
let history = [], busy = false, stopFlag = false, stopResolve = null, lockUntil = 0, timeouts = 0;
/** The tab this request started in (see forge.pin): the AI keeps working on THAT tab when you switch to another one. */
let pin = null;
const requestStop = () => { stopFlag = true; if (stopResolve) stopResolve(); };
/* ---- chat history: kept in Vextra's settings, newest first ---- */
const chats = (forge.settings.get('chats', []) || []).filter((x) => x && Array.isArray(x.messages)); let cur = null;
const newChat = () => { cur = { id: Date.now().toString(36), title: 'New chat', ts: Date.now(), messages: [] }; history = cur.messages; chats.unshift(cur); return cur; };
const persist = () => { if (cur) cur.ts = Date.now(); const rest = chats.filter((x) => x.messages.length).sort((a, b) => b.ts - a.ts).slice(0, 25); chats.length = 0; chats.push(...rest, ...(cur && !cur.messages.length ? [cur] : [])); forge.settings.set('chats', rest.map((x) => ({ id: x.id, title: x.title, ts: x.ts, cp: x.cp, usage: x.usage, last: x.last, est: x.est, messages: x.messages.slice(-80).map((m) => ({ role: m.role, content: clip(String(m.content), 6000) })) }))); };
const openChat = (id) => { const c = chats.find((x) => x.id === id); if (c) { cur = c; history = c.messages; } };
if (chats.length) openChat(chats[0].id); else newChat();
/** The AI could not be reached: say so, and (for internet providers) offer Reconnect + a 3-second countdown once the connection is back. Resolves 'retry' or 'cancel'. */
async function probe(c) { try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return false; const b = apiBase(c); if (!b) return false; await forge.net.request({ method: 'GET', url: b, timeout: 6 }); return true; } catch { return false; } }
function offlineFlow(c, ui, err, tries) {
  const P = PROVIDERS[c.provider] || PROVIDERS.custom, needsNet = !P.local;
  const box = ui.add('error', '⏱ The AI has timed out.'); if (box && err) box.title = String(err.message || err);
  if (!ui.h || !box) return new Promise((res) => setTimeout(() => res(stopFlag ? 'cancel' : tries < 3 ? 'retry' : 'cancel'), 5000)); /* panel not on screen: wait a little and retry by itself */
  return new Promise((resolve) => {
    const h = ui.h; let done = false, count = null, poll = null, tick = null, busyProbe = false; const auto = needsNet && tries < 3;
    const status = h('span', { style: 'font-size:11.5px;color:var(--muted)' }); const act = h('button', { class: 'btn sm primary' }, needsNet ? 'Reconnect' : 'Retry'); const cancel = h('button', { class: 'btn sm' }, 'Cancel');
    const row = h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:0 4px' }, act, cancel, status); ui.place(row);
    const finish = (v) => { if (done) return; done = true; clearInterval(poll); clearInterval(tick); clearInterval(watch); window.removeEventListener('online', onOn); row.remove(); resolve(v); };
    const countdown = () => { if (count !== null || done) return; count = 3; clearInterval(poll); act.disabled = true; const say = () => { status.textContent = `Back online – reconnecting in ${count}…`; }; say(); tick = setInterval(() => { count--; if (count <= 0) finish('retry'); else say(); }, 1000); };
    const check = async (manual) => { if (busyProbe || done || count !== null) return; busyProbe = true; if (manual) status.textContent = 'Checking connection…'; const ok = await probe(c); busyProbe = false; if (ok) countdown(); else status.textContent = needsNet ? 'Waiting for the internet…' + (auto ? ' (will reconnect automatically)' : '') : 'Could not reach the local server – is it running?'; };
    const onOn = () => { if (auto) check(false); };
    act.onclick = () => (needsNet ? check(true) : finish('retry')); cancel.onclick = () => finish('cancel');
    const watch = setInterval(() => { if (stopFlag) finish('cancel'); }, 300);
    if (needsNet) { window.addEventListener('online', onOn); status.textContent = auto ? 'Waiting for the internet… (will reconnect automatically)' : 'Still timing out – press Reconnect to try again.'; if (auto) { poll = setInterval(() => check(false), 3000); check(false); } }
    else status.textContent = 'Is the local server running?';
  });
}
/** Run the agent. `resume` continues from the last checkpoint instead of sending a new message. */
async function converse(userText, ui, resume) {
  const c = cfg(); c.nudges = 0; if (!cur) newChat(); transcript(); if (busy || Date.now() < lockUntil) return;
  if (resume) { if (!history.length) return; if (history[history.length - 1].role === 'assistant') history.push({ role: 'user', content: 'Continue where you left off and finish the task.' }); ui.add('note', '▶ Continuing from the checkpoint…'); }
  else { if (!cur.messages.length) cur.title = userText.replace(/\s+/g, ' ').slice(0, 48); history.push({ role: 'user', content: userText }); ui.add('user', userText); }
  pin = forge.pin(); cur.cp = null; persist(); busy = true; stopFlag = false; setStatus(); ui.busy(true); ui.checkpoint && ui.checkpoint(); let net = 0, reason = 'step limit';
  const STOP = Symbol('stop'); const stopP = new Promise((r) => { stopResolve = () => r(STOP); });
  const maxSteps = Math.max(1, Math.min(60, +c.maxSteps || 12));
  try {
    for (let step = 0; step < maxSteps; step++) {
      if (stopFlag) { reason = 'stopped'; break; } ui.add('note', 'thinking…', 'think'); let reply;
      try { const call = callModel(c, history.slice(-40), systemPrompt(c, await contextBlock())); call.catch(() => {}); reply = await Promise.race([call, stopP]); if (reply === STOP) { ui.clear('think'); reason = 'stopped'; break; } net = 0; timeouts = 0; }
      catch (e) {
        ui.clear('think');
        if (isNetErr(e)) { if (!stopFlag && await offlineFlow(c, ui, e, net++) === 'retry') { step--; continue; } reason = stopFlag ? 'stopped' : 'timed out'; if (!stopFlag) { timeouts++; lockUntil = Date.now() + Math.min(300, 30 * 2 ** (timeouts - 1)) * 1000; ui.lock && ui.lock(); } break; }
        ui.add('error', e.message); reason = 'error'; break;
      }
      ui.clear('think'); const u = usage.last; cur.usage = cur.usage || { inT: 0, outT: 0 }; cur.usage.inT += u.inT; cur.usage.outT += u.outT; /* the context only ever grows within a chat: a request can report less (trimmed history, Ollama's prompt cache, an estimate) but the conversation is not smaller */ cur.last = Math.max(cur.last || 0, u.inT + u.outT, estTokens(JSON.stringify(history))); cur.est = u.est && !(cur.last > u.inT + u.outT); ui.usage && ui.usage();
      history.push({ role: 'assistant', content: reply }); const env = envelope(reply); const shown = env ? String(env.say || '') : stripActions(reply); if (shown) ui.add('ai', shown);
      let acts = env ? parseActions('```json\n' + JSON.stringify(env.actions) + '\n```') : parseActions(reply);
      if (!acts.length) { const wantsAct = PERMS.some(([k]) => perm(k) !== 'deny' && k !== 'read') && (/"action"|\bvx[-\w]*\b|^\s*(\*\*)?(create|add|build|write)\b/im.test(reply)) && (c.nudges = (c.nudges || 0) + 1) <= 2 && step < maxSteps - 1; if (wantsAct) { ui.add('note', 'asking the model to actually perform the steps…'); history.push({ role: 'user', content: 'You described actions but none were executed. Do not describe them – perform them now. Reply with ONLY fenced ```vx-action blocks (one JSON object each, e.g. {"action":"new_game","dim":"2d"}) or ~~~vx-file blocks, no prose.' }); continue; } reason = null; break; }
      const results = []; let halted = false;
      for (const a of acts) { if (stopFlag) { halted = true; break; } const r = await Promise.race([a.action === '__badjson' ? 'invalid JSON – send one valid JSON object per block' : runAction(a, (m) => ui.add('note', m)), stopP]); if (r === STOP) { halted = true; break; } results.push(`${a.action}${a.path ? ' ' + a.path : ''}: ${r}`); }
      history.push({ role: 'user', content: 'Action results:\n' + (results.length ? results : ['(stopped by the user before running the remaining actions)']).map((r) => clip(r, 7000)).join('\n\n') });
      if (halted) { reason = 'stopped'; break; }
    }
  } finally {
    stopResolve = null; busy = false; setStatus(); ui.busy(false);
    { const away = !live() || (pin && pin.alive() && !pin.isActive()); if (away && reason !== 'stopped') forge.ui.toast(reason === 'error' ? '✨ The AI stopped with an error – open the AI panel' : reason === 'timed out' ? '✨ The AI timed out – open the AI panel' : reason === 'step limit' ? '✨ The AI paused – open the AI panel and press Continue' : '✨ The AI finished', reason ? undefined : 'ok'); } if (reason === 'stopped') ui.add('note', '■ Stopped.'); else if (reason === 'step limit') ui.add('note', `Paused after ${maxSteps} steps.`);
    if (reason && history.length) cur.cp = { reason, ts: Date.now() }; persist(); ui.refreshHistory && ui.refreshHistory(); ui.usage && ui.usage(); ui.checkpoint && ui.checkpoint();
  }
}

/* ------------------------------------------------------------ the chat view
   The run lives OUTSIDE the panel: closing the panel or switching tabs never stops it. The panel only shows a transcript (kept per chat); a panel that is
   opened again replays it and shows the live state (thinking…, Stop button) of a run that is still going. */
const hh = (t, a, ...k) => { const e = document.createElement(t); for (const [n, v] of Object.entries(a || {})) { if (n === 'class') e.className = v; else if (n.startsWith('on')) e[n] = v; else if (n === 'style') e.style.cssText = v; else e.setAttribute(n, v); } for (const x of k.flat()) if (x != null) e.append(x.nodeType ? x : document.createTextNode(x)); return e; };
let view = null; const live = () => !!(view && view.el.isConnected);
const transcript = (chat) => { chat = chat || cur; if (!chat.view) { chat.view = []; for (const m of chat.messages) { if (/^Action results:/.test(m.content) || /^You described actions/.test(m.content)) continue; if (m.role === 'user') chat.view.push({ kind: 'user', text: m.content }); else { const env = envelope(m.content); const t = env ? String(env.say || '') : stripActions(m.content); if (t) chat.view.push({ kind: 'ai', text: t }); } } } return chat.view; };
const out = {
  h: hh,
  add(kind, text, tag) { const e = { kind, text, tag: tag || '', t0: Date.now() }; transcript().push(e); return live() ? view.draw(e) : null; },
  place(n) { return live() ? view.place(n) : null; },
  clear(tag) { cur.view = transcript().filter((e) => e.tag !== tag); if (live()) view.clear(tag); },
  busy(b) { if (live()) view.busy(b); }, checkpoint() { if (live()) view.checkpoint(); }, lock() { if (live()) view.lock(); }, usage() { if (live()) view.usage(); }, refreshHistory() { if (live()) view.refreshHistory(); },
};
const setStatus = () => { try { st.update(busy ? '✨ AI · working…' : '✨ AI'); } catch { /* status bar not ready */ } };
forge.on('pluginSetting', (id) => { if (id === 'vextra-ai' && live()) { view.sync(); if (!history.length) view.renderLog(); } });
forge.on('configSaved', (id) => { if (id === 'vextra-ai' && live()) { view.sync(); if (!history.length) view.renderLog(); } });
const GUIDE_EXAMPLES = ['Build me a 2D platformer with a player, coins, spikes and a score.', 'Make a 3D maze game with a first-person camera.', 'Create a portfolio website with a gallery and a contact form.', 'Explain the file I have open and fix any bugs in it.'];

forge.panels.register({ id: 'chat', title: 'AI', icon: 'bot', render(el) {
  const h = hh; const c = cfg();
  const log = h('div', { style: 'flex:1;min-height:120px;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:4px 2px' });
  const preset = h('select', { title: 'Permissions', onchange: () => { const p = PRESETS[preset.value]; forge.settings.set('preset', preset.value); for (const [k] of PERMS) forge.settings.set('p_' + k, p[k]); forge.settings.set('maxSteps', preset.value === 'builder' ? 30 : 12); } }, h('option', { value: 'chat' }, 'Chat only'), h('option', { value: 'assist' }, 'Assist (ask first)'), h('option', { value: 'agent' }, 'Agent (auto, asks to delete)'), h('option', { value: 'builder' }, 'Builder (builds it all)'), h('option', { value: 'custom', disabled: true }, 'Custom (from settings)'));
  preset.value = PRESETS[c.preset] ? c.preset : 'assist';
  const input = h('textarea', { rows: 3, placeholder: 'Ask the AI… (Ctrl+Enter to send)', style: 'width:100%;resize:vertical' }); const send = h('button', { class: 'btn primary sm' }, 'Send'), stop = h('button', { class: 'btn sm', style: 'display:none', onclick: () => { requestStop(); } }, '■ Stop');
  let lockTimer = null; const askPh = input.placeholder; const lockBox = h('div', { style: 'display:none;font-size:11.5px;padding:6px 9px;border-radius:8px;background:rgba(232,163,61,.18);color:var(--text)' }), cpBox = h('div', { style: 'display:none;gap:6px;align-items:center;font-size:11.5px;padding:5px 8px;border-radius:8px;background:rgba(127,127,127,.15)' });
  const bar = h('div', { style: 'height:6px;border-radius:3px;background:rgba(127,127,127,.25);overflow:hidden' }, h('div', { style: 'height:100%;width:0;transition:width .3s' })), tok = h('div', { style: 'font-size:11px;color:var(--muted)' });
  const modelLbl = h('div', { style: 'font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis', title: 'Change in ⚙ Configure' });
  const runBox = h('div', { style: 'display:none;font-size:11.5px;padding:5px 9px;border-radius:8px;background:rgba(108,140,255,.16)' }, '⚙ The AI is working. You can switch tabs – it keeps going in the tab it started in.');
  /* AI answers: prose + real code blocks (language label, line numbers, Copy) */
  const rich = (text) => {
    const box = h('div', { style: 'font-size:12.5px;padding:6px 9px;border-radius:8px;background:var(--panel2,rgba(127,127,127,.12));max-width:98%;word-break:break-word;display:flex;flex-direction:column;gap:4px' });
    const prose = (t) => { if (!t.trim()) return; const d = h('div', { style: 'white-space:pre-wrap' }); t.trim().split(/(`[^`\n]+`)/).forEach((part) => (part.length > 2 && part.startsWith('`') && part.endsWith('`') ? d.append(h('code', { style: 'background:rgba(127,127,127,.22);padding:0 4px;border-radius:4px;font-size:.92em' }, part.slice(1, -1))) : d.append(part))); box.append(d); };
    const code = (src, lang) => { const w = h('div'); if (window.VX && VX.codeBlock) { try { w.innerHTML = VX.codeBlock(src, lang || ''); } catch { w.append(h('pre', { style: 'overflow:auto' }, src)); } } else w.append(h('pre', { style: 'overflow:auto;background:rgba(0,0,0,.25);padding:8px;border-radius:6px' }, src)); box.append(w); };
    const re = new RegExp(FENCE.source, 'g'); let last = 0, m; while ((m = re.exec(text))) { prose(text.slice(last, m.index)); code(m[3], String(m[2] || '').trim().split(/\s/)[0]); last = m.index + m[0].length; } prose(text.slice(last));
    if (window.VX && VX.wireCopy) VX.wireCopy(box); return box;
  };
  const think = (b, e) => { const tick = () => { if (!b.isConnected) { clearInterval(b._t); return; } const sec = Math.floor((Date.now() - e.t0) / 1000); b.textContent = '✨ thinking' + '.'.repeat(1 + (Math.floor(Date.now() / 400) % 3)) + (sec >= 2 ? '  ' + (sec >= 60 ? Math.floor(sec / 60) + 'm ' + (sec % 60) + 's' : sec + 's') : ''); }; tick(); b._t = setInterval(tick, 400); };
  const guide = () => {
    const ex = h('div', { style: 'display:flex;flex-direction:column;gap:3px' }, GUIDE_EXAMPLES.map((q) => h('a', { href: '#', style: 'color:var(--accent);text-decoration:none', onclick: (ev) => { ev.preventDefault(); input.value = q; input.focus(); } }, '▸ ' + q)));
    const li = (...k) => h('li', { style: 'margin:2px 0' }, ...k), b = (t) => h('b', {}, t);
    return h('details', { open: '', 'data-guide': '1', style: 'font-size:12px;line-height:1.5;background:rgba(127,127,127,.1);border-radius:8px;padding:6px 10px' },
      h('summary', { style: 'cursor:pointer;font-weight:600' }, 'How the AI works'),
      h('p', { style: 'margin:6px 0 2px' }, b('What it does. '), 'You say what you want in plain words. The AI writes a short ', b('Plan'), ', then builds it itself: it creates and edits files, changes the file you have open and builds games (scenes, objects, sprites and block-coded behaviours). When it is done it posts a ', b('Done'), ' summary of what now exists.'),
      h('p', { style: 'margin:6px 0 2px' }, b('What you see. '), 'Grey lines are the steps it takes (📄 read, ✏️ edited, 🎮 game change). “✨ thinking…” with a timer means the model is working – it stays there as long as the AI runs. Code is shown in code blocks with a Copy button.'),
      h('p', { style: 'margin:6px 0 2px' }, b('It keeps going in the background. '), 'You can switch tabs or close this panel: the AI continues in the tab it started in and tells you when it is finished. ', b('■ Stop'), ' ends it; ', b('▶ Continue'), ' resumes from where it stopped.'),
      h('p', { style: 'margin:6px 0 2px' }, b('Permissions. '), 'The box at the top decides what it may do: ', b('Chat only'), ' (talks, changes nothing) · ', b('Assist'), ' (reads freely, asks before every change) · ', b('Agent'), ' (changes without asking, asks before deleting) · ', b('Builder'), ' (builds everything; use it for big jobs). Fine control is under ⚙.'),
      h('p', { style: 'margin:6px 0 2px' }, b('Game behaviours attach to a target. '), 'A behaviour does nothing until it is attached to one of three places:'),
      h('ul', { style: 'margin:0 0 4px 16px;padding:0' }, li(b('Entity'), ' – one object (player controls, an enemy’s AI, a coin).'), li(b('Scene'), ' – one level (score and win/lose rules, spawners, the HUD).'), li(b('Game'), ' – the whole game, every scene (pause menu, music, lives).')),
      h('p', { style: 'margin:6px 0 2px' }, b('Try asking:')), ex,
      h('p', { style: 'margin:6px 0 0;color:var(--muted)' }, 'First time? Open ⚙ and choose a provider and model (a local Ollama or LM Studio needs no key). Everything you type is sent to that provider.'));
  };
  const ui = {
    el, h,
    draw(e) {
      const kind = e.kind, bubble = kind === 'ai' ? rich(e.text) : h('div', { style: `white-space:pre-wrap;word-break:break-word;font-size:12.5px;padding:6px 9px;border-radius:8px;${kind === 'user' ? 'align-self:flex-end;background:var(--accent);color:#fff;max-width:92%' : kind === 'error' ? 'background:rgba(255,80,80,.15);color:var(--danger)' : kind === 'note' ? 'color:var(--muted);font-size:11.5px;padding:0 4px' : 'background:var(--panel2,rgba(127,127,127,.12));max-width:98%'}` }, e.text);
      bubble._tag = e.tag || ''; if (e.tag === 'think') { bubble.style.cssText += ';color:var(--accent);font-weight:600;padding:2px 6px'; think(bubble, e); } log.append(bubble); log.scrollTop = log.scrollHeight; return bubble;
    },
    checkpoint() { cpBox.textContent = ''; const k = cur && cur.cp; if (!k || !history.length) { cpBox.style.display = 'none'; return; } cpBox.style.display = 'flex'; const go2 = h('button', { class: 'btn sm primary', title: 'Carry on from where the AI left off', onclick: () => { if (!busy) converse('', out, true); } }, '▶ Continue'); go2.disabled = busy || Date.now() < lockUntil; cpBox.append(h('span', { style: 'flex:1' }, `⏸ Checkpoint – ${k.reason}. Pick up where it left off?`), go2, h('button', { class: 'btn sm', onclick: () => { cur.cp = null; persist(); ui.checkpoint(); } }, 'Dismiss')); },
    lock() { clearInterval(lockTimer); const upd = () => { const left = Math.ceil((lockUntil - Date.now()) / 1000); if (left <= 0) { clearInterval(lockTimer); lockBox.style.display = 'none'; input.disabled = false; send.disabled = busy; input.placeholder = askPh; ui.checkpoint(); return; } lockBox.style.display = ''; lockBox.textContent = `⏱ The AI timed out. You can run it again at ${new Date(lockUntil).toLocaleTimeString()} (in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}).`; input.disabled = true; send.disabled = true; input.placeholder = 'Waiting before the next run…'; }; upd(); lockTimer = setInterval(upd, 500); },
    sync() { const k = cfg(), Pk = PROVIDERS[k.provider] || PROVIDERS.custom; modelLbl.textContent = `${Pk.label} · ${k.model || 'no model selected'}`; const m = Object.keys(PRESETS).find((n) => PERMS.every(([q]) => PRESETS[n][q] === perm(q))); preset.value = m || 'custom'; ui.usage(); },
    place(n) { log.append(n); log.scrollTop = log.scrollHeight; return n; },
    clear(tag) { [...log.children].filter((n) => n._tag === tag).forEach((n) => { clearInterval(n._t); n.remove(); }); },
    usage() { const k = cfg(), win = ctxWindow(k), used = (cur && cur.last) || 0, pct = Math.min(100, Math.round((used / win) * 100)), t = (cur && cur.usage) || { inT: 0, outT: 0 }, f = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(n)); bar.firstChild.style.width = pct + '%'; bar.firstChild.style.background = pct > 90 ? 'var(--danger,#e55)' : pct > 70 ? '#e8a33d' : 'var(--accent)'; bar.title = `Context window: how much of the model's memory this chat fills (${used.toLocaleString()} of ${win.toLocaleString()} tokens)`; tok.textContent = `${cur && cur.est ? '~' : ''}${f(used)} / ${f(win)} tokens (${pct}%) · chat total ${f(t.inT)} in, ${f(t.outT)} out`; },
    busy(b) { send.disabled = b || Date.now() < lockUntil; stop.style.display = b ? '' : 'none'; runBox.style.display = b ? '' : 'none'; },
  };
  const go = () => { const t = input.value.trim(); if (!t || busy || Date.now() < lockUntil) return; input.value = ''; const g = log.querySelector('[data-guide]'); if (g) g.remove(); converse(t, out); };
  send.onclick = go; input.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } };
  const renderLog = () => { for (const n of [...log.children]) clearInterval(n._t); log.textContent = ''; const es = transcript(); if (!es.length) { log.append(guide()); const k = cfg(), Pk = PROVIDERS[k.provider] || PROVIDERS.custom; ui.draw({ kind: 'note', text: `Model: ${Pk.label} · ${k.model || 'no model selected'}` }); } else es.forEach((e) => ui.draw(e)); };
  ui.renderLog = renderLog;
  const hist = h('select', { title: 'Chat history', style: 'flex:1;min-width:0', onchange: () => { if (busy) { hist.value = cur ? cur.id : ''; return; } openChat(hist.value); renderLog(); ui.usage(); ui.checkpoint(); } });
  ui.refreshHistory = () => { hist.textContent = ''; const list = chats.filter((x) => x.messages.length || x === cur); if (!list.length) hist.append(h('option', { value: '' }, 'No chats yet')); for (const x of list) hist.append(h('option', { value: x.id }, (x.messages.length ? '' : '✦ ') + x.title + (x.messages.length ? ' · ' + new Date(x.ts).toLocaleDateString() : ''))); if (cur) hist.value = cur.id; };
  const style = h('style', {}, '.vx-ai .codeblock{margin:2px 0;font-size:12px}.vx-ai .cb-pre{font-size:12px}.vx-ai .cb-head{position:static}');
  view = ui; el.classList.add('vx-ai');
  ui.refreshHistory(); renderLog(); ui.sync(); ui.checkpoint(); if (busy) ui.busy(true); if (Date.now() < lockUntil) ui.lock();
  el.style.cssText = 'display:flex;flex-direction:column;height:100%;gap:6px;padding:6px';
  el.append(style, h('div', { style: 'display:flex;gap:6px;align-items:center' }, hist, h('button', { class: 'btn sm', title: 'Delete this chat', onclick: () => { if (busy || !cur) return; const k = chats.indexOf(cur); if (k >= 0) chats.splice(k, 1); cur = null; persist(); if (chats.length) openChat(chats[0].id); else newChat(); ui.refreshHistory(); renderLog(); ui.usage(); ui.checkpoint(); } }, '🗑'), h('button', { class: 'btn sm', title: 'Start a new chat', onclick: () => { if (busy) return; newChat(); ui.refreshHistory(); renderLog(); ui.usage(); ui.checkpoint(); } }, 'New')), h('div', { style: 'display:flex;gap:6px;align-items:center' }, preset, modelLbl, h('button', { class: 'btn sm', title: 'How the AI works', onclick: () => { const g = log.querySelector('[data-guide]'); if (g) g.remove(); else log.prepend(guide()); } }, '?'), h('button', { class: 'btn sm', title: 'Provider, model and permissions', onclick: () => forge.config.open() }, '⚙')), runBox, log, cpBox, lockBox, h('div', { style: 'display:flex;flex-direction:column;gap:3px' }, bar, tok), input, h('div', { style: 'display:flex;gap:6px;justify-content:flex-end' }, stop, send));
} });
forge.commands.register({ id: 'configure', title: 'AI: Configure…', run: () => forge.config.open() });
forge.commands.register({ id: 'ask', title: 'AI: Ask about the open file…', async run() { const q = await forge.ui.prompt('Ask the AI about the open file'); if (!q) return; forge.ui.toast('Open the AI panel to see the answer.'); await converse(q + '\n\n(Use get_editor if you need the file.)', out); } });

forge.config.register({
  title: 'Vextra AI', intro: 'Pick the model you want to talk to and decide exactly what it is allowed to do. Local models (Ollama, LM Studio) need no key and nothing leaves your computer.', defaults: DEF,
  fields: [
    { key: 'provider', label: 'Provider', type: 'select', group: 'Model', options: Object.entries(PROVIDERS).map(([k, v]) => [k, v.label]) },
    { key: 'model', label: 'Model', type: 'dynamic', group: 'Model', loadOptions: listModels, refreshOn: ['provider', 'baseUrl', 'apiKey'], hint: 'Local servers (Ollama, LM Studio): the models you have installed on this computer. Cloud providers: the models your API key can use. Pick “Other…” to type a name.' },
    { key: 'baseUrl', label: 'Server URL (optional)', group: 'Model', placeholder: 'empty = provider default', hint: 'Leave empty for the default. Ollama and LM Studio only ever connect to this computer (localhost); use “Ollama Cloud” or “Custom” for a remote server.' },
    { key: 'apiKey', label: 'API key', type: 'password', group: 'Model', hint: 'Stored in Vextra\'s settings on this computer. Not needed for local models.' },
    { key: 'temperature', label: 'Temperature (0–1)', type: 'number', group: 'Generation' }, { key: 'maxTokens', label: 'Max answer length (tokens)', type: 'number', group: 'Generation' },
    { key: 'timeout', label: 'Timeout (seconds, max 3600 = 1 hour)', type: 'number', group: 'Generation' }, { key: 'ctxWindow', label: 'Context window (tokens, 0 = auto)', type: 'number', group: 'Generation', hint: 'Applies to every provider: the usage bar, the Ollama context size, and older messages are dropped to fit it. 0 = a sensible default for the model.' }, { key: 'maxSteps', label: 'Max actions per request', type: 'number', group: 'Generation', hint: 'Stops runaway loops.' },
    ...PERMS.map(([k, l]) => ({ key: 'p_' + k, label: l, type: 'select', group: 'Permissions', options: [['deny', 'Deny'], ['ask', 'Ask me each time'], ['allow', 'Allow']] })),
    { key: 'system', label: 'Extra instructions', type: 'textarea', group: 'Behaviour', hint: 'Added to every request, e.g. your coding style.' },
  ],
  onChange(key, v, api) {
    const saved = (pr) => ((forge.settings.get('modelBy') || {})[pr]) || (forge.settings.get('provider') === pr ? forge.settings.get('model') : '') || '';
    if (key === 'provider') api.set('model', saved(v.provider));
    if (key === 'apiKey') { const g = guessProvider(v.apiKey); if (g && g !== v.provider) { api.set('provider', g); api.set('model', saved(g)); forge.ui.toast('Detected a ' + PROVIDERS[g].label + ' key', 'ok'); } }
  },
  validate: (v) => ((PROVIDERS[v.provider] || {}).local && v.baseUrl && !isLoopback(v.baseUrl) ? `${PROVIDERS[v.provider].label} only connects to this computer. Use localhost / 127.0.0.1, or pick “Ollama Cloud” / “Custom” for a remote server.` : v.baseUrl && !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1|\[::1\]))/i.test(v.baseUrl) ? 'The server URL must start with https:// (or http://localhost).' : v.provider === 'custom' && !v.baseUrl ? 'Custom needs a server URL.' : null),
});
forge.on('configSaved', (id, v) => { if (id === 'vextra-ai' && v && v.provider) forge.settings.set('modelBy', Object.assign({}, forge.settings.get('modelBy') || {}, { [v.provider]: v.model || '' })); });
const st = forge.statusBar.add({ id: 'ai', text: '✨ AI', align: 'right', tooltip: 'Vextra AI – open settings', onClick: () => forge.config.open() });
forge.onUnload(() => { requestStop(); view = null; });
