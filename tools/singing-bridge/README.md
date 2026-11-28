# Vextra singing bridge

The Music studio's **🎤 AI singer…** sings lyrics on a track's melody – solo or as a choir. Singing models such as
[SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer) (Apache-2.0; English, Mandarin, Cantonese) need Python and usually
an NVIDIA GPU, so they cannot run inside the app. This small program runs on your computer and the studio talks to it.

## Try it in one minute (no AI needed)
```
python bridge.py --demo
```
Open the studio → Music → **🎤 AI singer…** → leave the address at `http://127.0.0.1:8765` → **Sing**. You hear plain tones on your
melody. That proves the connection works. For the web version (not the desktop app) allow its address:
`python bridge.py --demo --origin http://localhost:5173`.

## Use SoulX-Singer
1. Install SoulX-Singer by its own instructions (Python 3.10, its requirements, model download).
2. Prepare a short reference recording of the voice you want and its metadata JSON (see its `preprocess` README).
3. `python bridge.py --soulx C:\path\to\SoulX-Singer --prompt-wav voice.wav --prompt-meta voice.json`
4. If the model complains, edit `SOULX_CMD` (or set the `SOULX_CMD` environment variable) to match `example/infer.sh`, and check
   `build_metadata()` against `example/music.json`. Install `g2p_en` / `pypinyin` for phonemes (`phonemize()`).

**Status:** the `--demo` engine and the protocol are tested. The SoulX-Singer adapter is a reference that has not been run against a
real checkout – expect to adjust the command and metadata. Any other engine can be added by replacing the `soulx()` function.

## Choir
The studio makes each choir part itself (alto/tenor/bass are scale-snapped harmonies of the melody) and calls `/sing` once per part
with `"part": "alto"` etc., then lays the results on separate audio lanes.

## Privacy
Listens on `127.0.0.1` only (this computer). Only lyrics + notes are received; nothing is stored. Do not expose it to the internet
without your own authentication.
