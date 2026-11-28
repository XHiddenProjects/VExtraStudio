#!/usr/bin/env python3
"""Vextra singing bridge – lets the Music studio's "AI singer" use a singing-voice model on THIS computer.

    python bridge.py --demo                      # no AI needed: sings plain tones, to test the connection
    python bridge.py --soulx C:\\path\\to\\SoulX-Singer   # use a SoulX-Singer checkout (see README.md)
    (Vextra Studio's desktop app installs and starts this for you: AI singer → "Install".)

Protocol (what the studio speaks):
    GET  /health  -> {"ok": true, "engine": "...", "languages": ["en","zh","yue"], "voices": [{"id","name"}]}
    POST /sing    {lyrics, language, voice, bpm, part, seed, notes:[{start,dur,midi}]}  -> audio/wav

Only the standard library is used. It listens on 127.0.0.1 by default and answers only the origins you allow.
STATUS: the --demo engine, the protocol and the metadata builder are tested. The SoulX-Singer engine itself (needs the model, Python 3.10
and usually an NVIDIA GPU) has not been run end to end by the author - English only for now."""
import argparse, json, math, os, re, shutil, struct, subprocess, sys, tempfile, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 1_000_000
SR = 24000
PHONE_SET = "soulxsinger/utils/phoneme/phone_set.json"
VOWELS = set("AEIOU")


def load_phone_set(root):
    """The tokens the model understands (a list, or a dict whose keys are the tokens)."""
    with open(os.path.join(root, PHONE_SET), "r", encoding="utf-8") as f:
        d = json.load(f)
    return set(d.keys() if isinstance(d, dict) else d)


_g2p = None
def g2p_words(lyrics):
    """English lyrics -> [[syllable, ...] per word]; a syllable is a list of ARPAbet phonemes like ['HH','AH0']. Needs g2p_en (installed with SoulX-Singer)."""
    global _g2p
    from g2p_en import G2p
    _g2p = _g2p or G2p()
    words = []
    for w in lyrics.replace("-", " ").split():
        w = "".join(c for c in w if c.isalpha() or c == "'")
        if not w: continue
        ph = [p for p in _g2p(w) if p.strip() and p not in ("'", " ")]
        words.append(split_syllables(ph))
    return words


def split_syllables(ph):
    """Each vowel starts a syllable; a lone consonant between vowels opens the next one, a cluster is shared."""
    nuc = [i for i, p in enumerate(ph) if p[0] in VOWELS]
    if not nuc: return [ph] if ph else []
    cuts = [0]
    for a, b in zip(nuc, nuc[1:]):
        gap = b - a - 1
        cuts.append(b if gap == 0 else b - 1)
    cuts.append(len(ph))
    return [ph[cuts[k]:cuts[k + 1]] for k in range(len(nuc)) if ph[cuts[k]:cuts[k + 1]]]


def tokens_for(lyrics, language, phone_set, n_notes):
    """One model token per note: 'en_HH-AH0' (phonemes of a syllable joined by '-'). Returns (tokens, kinds) where kind 2 = new syllable, 3 = held (slur)."""
    if language != "en": raise ValueError("this bridge sings English only; other languages need their own phonemizer (see phonemize in bridge.py)")
    syl = [s for w in g2p_words(lyrics) for s in w]
    toks = []
    for s in syl:
        keep = [p for p in s if "en_" + p in phone_set]
        if keep: toks.append("en_" + "-".join(keep))
    if not toks: raise ValueError("could not turn those lyrics into sounds the singer knows")
    out, kinds = [], []
    for i in range(n_notes):
        k = i * len(toks) // n_notes if n_notes >= len(toks) else i
        if k >= len(toks): k = len(toks) - 1
        first = i == 0 or (i * len(toks) // n_notes if n_notes >= len(toks) else i) != ((i - 1) * len(toks) // n_notes if n_notes >= len(toks) else i - 1)
        out.append(toks[k]); kinds.append(2 if first else 3)
    return out, kinds


def build_segments(req, phone_set):
    """Target metadata (a LIST of segments, like example/audio/music.json): notes and the rests between them, in ms from the start."""
    notes = req["notes"]
    toks, kinds = tokens_for(req["lyrics"], req["language"], phone_set, len(notes))
    segs, cur, seg_start, t = [], None, None, 0.0
    def flush(end):
        nonlocal cur
        if cur and cur["ph"]:
            cur["time"] = [int(round(cur["t0"] * 1000)), int(round(end * 1000))]
            segs.append(cur)
        cur = None
    def fresh(t0): return {"t0": t0, "ph": [], "dur": [], "pitch": [], "type": []}
    for n, tok, kind in zip(notes, toks, kinds):
        gap = n["start"] - t
        if cur is not None and gap > 0.3 and (n["start"] - cur["t0"]) > 18: flush(t)       # split long songs at a rest
        if cur is None: cur = fresh(n["start"])
        elif gap > 0.02:
            cur["ph"].append("<SP>"); cur["dur"].append(gap); cur["pitch"].append(0); cur["type"].append(1)
        cur["ph"].append(tok); cur["dur"].append(n["dur"]); cur["pitch"].append(n["midi"]); cur["type"].append(kind)
        t = n["start"] + n["dur"]
    flush(t)
    lang = {"en": "English", "zh": "Mandarin", "yue": "Cantonese"}[req["language"]]
    return [{"index": f"vx_{s['time'][0]}_{s['time'][1]}", "language": lang, "time": s["time"],
             "duration": " ".join(f"{d:.2f}" for d in s["dur"]), "text": " ".join(x for x in s["ph"]), "phoneme": " ".join(s["ph"]),
             "note_pitch": " ".join(str(p) for p in s["pitch"]), "note_type": " ".join(str(k) for k in s["type"])} for s in segs]


def list_voices(root, voices_dir):
    """The built-in example singer plus any NAME.wav/mp3/flac + NAME.json pairs you drop into the voices folder."""
    out = {}
    ex = os.path.join(root, "example", "audio")
    for ext in ("wav", "mp3"):
        w, m = os.path.join(ex, "zh_prompt." + ext), os.path.join(ex, "zh_prompt.json")
        if os.path.isfile(w) and os.path.isfile(m): out["default"] = ("Example voice", w, m); break
    if voices_dir and os.path.isdir(voices_dir):
        for f in sorted(os.listdir(voices_dir)):
            b, e = os.path.splitext(f)
            if e.lower() in (".wav", ".mp3", ".flac") and os.path.isfile(os.path.join(voices_dir, b + ".json")):
                out[re.sub(r"[^A-Za-z0-9_-]", "_", b)[:40]] = (b, os.path.join(voices_dir, f), os.path.join(voices_dir, b + ".json"))
    return out


def soulx(req, out_wav, a):
    root = os.path.abspath(a.soulx)
    voices = list_voices(root, a.voices)
    v = voices.get(req["voice"] or "default") or voices.get("default")
    if not v: raise RuntimeError("no singer voice found (the SoulX-Singer example prompt is missing)")
    with tempfile.TemporaryDirectory() as d:
        tmeta = os.path.join(d, "target.json")
        with open(tmeta, "w", encoding="utf-8") as f:
            json.dump(build_segments(req, load_phone_set(root)), f, ensure_ascii=False)
        cmd = [sys.executable, "-m", "cli.inference", "--device", a.device, "--model_path", "pretrained_models/SoulX-Singer/model.pt",
               "--config", "soulxsinger/config/soulxsinger.yaml", "--prompt_wav_path", v[1], "--prompt_metadata_path", v[2],
               "--target_metadata_path", tmeta, "--phoneset_path", PHONE_SET, "--save_dir", d, "--control", "score", "--auto_shift", "--pitch_shift", "0"]
        if a.device == "cuda": cmd.append("--fp16")
        env = dict(os.environ, PYTHONPATH=root + os.pathsep + os.environ.get("PYTHONPATH", ""), HF_HUB_OFFLINE="1")
        r = subprocess.run(cmd, cwd=root, env=env, capture_output=True, text=True, timeout=1800)
        gen = os.path.join(d, "generated.wav")
        if r.returncode != 0 or not os.path.exists(gen):
            raise RuntimeError("SoulX-Singer failed: " + ((r.stderr or r.stdout or "no output").strip()[-400:]))
        shutil.copyfile(gen, out_wav)


def tone_wav(notes, path, bpm_unused=None):
    """--demo engine: a soft vowel-ish tone per note, so you can hear the melody and check the whole path works."""
    total = max((n["start"] + n["dur"] for n in notes), default=0.5) + 0.3
    data = [0.0] * int(total * SR)
    for n in notes:
        f = 440.0 * 2 ** ((n["midi"] - 69) / 12)
        a, b = int(n["start"] * SR), int((n["start"] + n["dur"]) * SR)
        for i in range(a, min(b, len(data))):
            t = (i - a) / SR; env = min(1, t / 0.05, (b - i) / SR / 0.08) if b > i else 0
            v = math.sin(2 * math.pi * f * t) + 0.4 * math.sin(4 * math.pi * f * t + 0.3) + 0.15 * math.sin(6 * math.pi * f * t)
            data[i] += 0.25 * max(0, env) * v * (1 + 0.03 * math.sin(2 * math.pi * 5.5 * t))
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x)) * 32000)) for x in data))


def clean(req):
    if not isinstance(req, dict) or not isinstance(req.get("notes"), list) or not req["notes"]: raise ValueError("no notes")
    notes = []
    for n in req["notes"][:400]:
        notes.append({"start": max(0.0, float(n["start"])), "dur": max(0.05, min(30.0, float(n["dur"]))), "midi": max(24, min(108, int(n["midi"])))})
    lang = req.get("language") if req.get("language") in ("en", "zh", "yue") else "en"
    return {"lyrics": str(req.get("lyrics", ""))[:600], "language": lang, "voice": str(req.get("voice", ""))[:60], "notes": notes, "part": str(req.get("part", "solo"))[:20]}


def make_handler(args):
    allowed = set(args.origin)

    class H(BaseHTTPRequestHandler):
        def _cors(self):
            o = self.headers.get("Origin")
            if o and (o in allowed or "*" in allowed):
                self.send_header("Access-Control-Allow-Origin", o); self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type"); self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")

        def _send(self, code, body, ctype="application/json"):
            if isinstance(body, (dict, list)): body = json.dumps(body).encode()
            self.send_response(code); self._cors(); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

        def do_OPTIONS(self): self._send(204, b"")

        def do_GET(self):
            if self.path.split("?")[0] == "/health":
                self._send(200, {"ok": True, "engine": "demo tones" if args.demo else "SoulX-Singer", "languages": ["en"], "voices": [{"id": k, "name": v[0]} for k, v in (list_voices(os.path.abspath(args.soulx), args.voices).items() if not args.demo else [("default", ("Default tones",))])]})
            else: self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path.split("?")[0] != "/sing": return self._send(404, {"error": "not found"})
            try:
                n = int(self.headers.get("Content-Length", "0"))
                if n <= 0 or n > MAX_BODY: return self._send(413, {"error": "request too large"})
                req = clean(json.loads(self.rfile.read(n)))
            except Exception as e: return self._send(400, {"error": "bad request: " + str(e)[:100]})
            try:
                with tempfile.TemporaryDirectory() as d:
                    out = os.path.join(d, "out.wav")
                    if args.demo: tone_wav(req["notes"], out)
                    else: soulx(req, out, args.soulx, args.prompt_wav, args.prompt_meta)
                    with open(out, "rb") as f: self._send(200, f.read(), "audio/wav")
            except Exception as e:
                self._send(500, {"error": str(e)[:300]})

        def log_message(self, fmt, *a): sys.stderr.write("[bridge] " + (fmt % a) + "\n")
    return H


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--demo", action="store_true", help="sing plain tones (no AI model) to test the connection")
    p.add_argument("--soulx", help="folder of your SoulX-Singer checkout (with pretrained_models downloaded)")
    p.add_argument("--voices", help="folder with extra singer voices: NAME.wav + NAME.json pairs")
    p.add_argument("--device", default="cuda", choices=["cuda", "cpu"], help="cuda needs an NVIDIA graphics card; cpu is very slow")
    p.add_argument("--host", default="127.0.0.1"); p.add_argument("--port", type=int, default=8765)
    p.add_argument("--origin", action="append", default=[], help="web origin allowed to call the bridge, e.g. http://localhost:5173 (repeat). The desktop app is allowed by default")
    a = p.parse_args()
    if not a.demo and not a.soulx: p.error("use --demo, or give --soulx")
    a.origin += ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(a))
    print(f"Singing bridge ({'demo' if a.demo else 'SoulX-Singer'}) on http://{a.host}:{a.port} – leave this window open. Ctrl+C stops it.")
    try: srv.serve_forever()
    except KeyboardInterrupt: pass


if __name__ == "__main__": main()
