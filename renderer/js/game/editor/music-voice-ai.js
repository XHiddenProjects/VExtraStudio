/* Vextra game editor – AI voice for the Music studio (VX.aiVoice).
   Text → natural speech with the open-source Kokoro-82M model, running in the browser (WebAssembly) – no account, no server of ours.
   The model (~90 MB) is downloaded ONCE, with the person's OK, from the jsDelivr and Hugging Face CDNs and kept in the browser cache; after that it works offline.
   The result is a normal audio clip on the song's timeline, so it can be moved, cut, faded and mixed like a recording.
   It speaks (it does not sing a melody): pitch can be shifted to match the key, and the choir voices (Vocals from text) are the sung option. */
(function () {
  const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX', LIB = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0/dist/kokoro.web.js', KEY = 'vx-aivoice-ok', MAX = 360;
  const VOICES = [['af_heart', 'Heart – warm American woman'], ['af_bella', 'Bella – bright American woman'], ['af_nicole', 'Nicole – soft, close-mic woman'], ['af_sarah', 'Sarah – clear American woman'], ['af_nova', 'Nova – young woman'], ['am_adam', 'Adam – American man'], ['am_michael', 'Michael – friendly American man'], ['am_onyx', 'Onyx – deep man'], ['bf_emma', 'Emma – British woman'], ['bf_lily', 'Lily – British girl'], ['bm_george', 'George – British man'], ['bm_fable', 'Fable – British storyteller']];
  let tts = null, loading = null, override = null;
  const consented = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  const remember = () => { try { localStorage.setItem(KEY, '1'); } catch { /* private window */ } };
  /** loads (once) the model; onProgress gets 0–100 */
  async function load(onProgress) {
    if (override) return override; if (tts) return tts; if (loading) return loading;
    loading = (async () => {
      const mod = await import(/* webpackIgnore: true */ LIB); if (!mod || !mod.KokoroTTS) throw new Error('The voice library did not load.');
      const seen = {}; const cb = (p) => { if (!onProgress || !p) return; if (p.file && p.total) { seen[p.file] = [p.loaded || 0, p.total]; let l = 0, t = 0; for (const k of Object.keys(seen)) { l += seen[k][0]; t += seen[k][1]; } if (t) onProgress(Math.min(99, Math.round((l / t) * 100))); } };
      tts = await mod.KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm', progress_callback: cb }); return tts;
    })().finally(() => { loading = null; });
    return loading;
  }
  /** shift pitch by resampling (also changes the speed a little, which suits a sung-style delivery) */
  function shift(data, st) { if (!st) return data; const r = Math.pow(2, st / 12), n = Math.floor(data.length / r), out = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * r, a = Math.floor(p), f = p - a; out[i] = (data[a] || 0) * (1 - f) + (data[a + 1] || 0) * f; } return out; }
  /** returns a WAV data URL */
  async function speak(text, o = {}) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX); if (!text) throw new Error('Type something to say.');
    const t = await load(o.onProgress); const a = await t.generate(text, { voice: o.voice || 'af_heart', speed: o.speed || 1 });
    let data = a.audio, sr = a.sampling_rate || 24000; if (!data && a.toBlob) { throw new Error('This voice engine version returned an unexpected format.'); }
    data = shift(Float32Array.from(data), o.pitch || 0); let pk = 0; for (let i = 0; i < data.length; i++) pk = Math.max(pk, Math.abs(data[i])); if (pk > 0) { const g = Math.min(2, 0.9 / pk); for (let i = 0; i < data.length; i++) data[i] *= g; }
    const ctx = o.ctx || new (window.AudioContext || window.webkitAudioContext)(), buf = ctx.createBuffer(1, Math.max(1, data.length), sr); buf.copyToChannel(data, 0);
    return window.VXMusicGen.toWavDataURL(buf);
  }
  VX.aiVoice = { VOICES, MAX, speak, load, consented, remember, ready: () => !!(tts || override), _t: { setEngine(e) { override = e; }, shift } };
})();
