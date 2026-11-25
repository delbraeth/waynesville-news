"""Word timings for the daily video.

    python scripts/video/timings.py <episode.mp3> <script.txt> <out.json>

Transcribes the MP3 with faster-whisper (CPU, base.en) only to learn *when*
words are spoken, then aligns the script's own words to those times, so
captions always use the script's spelling. Output: a list of sentences
{i, para, text, start, end, words:[{w,s,e}]} in seconds from the start of the
MP3 (intro music included).
"""
import json, re, subprocess, sys, difflib

import numpy as np
from faster_whisper import WhisperModel

mp3, script_path, out_path = sys.argv[1:4]

# Decode with ffmpeg ourselves (16 kHz mono float32) rather than through PyAV.
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", mp3, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                     check=True, capture_output=True).stdout
audio = np.frombuffer(pcm, dtype=np.float32)

model = WhisperModel("base.en", device="cpu", compute_type="int8")
segs, _ = model.transcribe(audio, word_timestamps=True, beam_size=5)
asr = [{"w": w.word, "s": float(w.start), "e": float(w.end)} for s in segs for w in s.words]

def split_sentences(p):
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", p.strip())
    out = []
    for x in parts:
        # "at 7 p.m. Friday" is one sentence
        if out and re.search(r"\b[ap]\.m\.$", out[-1]):
            out[-1] += " " + x
        else:
            out.append(x)
    return [x for x in out if x]

paras = [p.strip() for p in open(script_path, encoding="utf-8").read().strip().split("\n\n") if p.strip()]
sents = []
for pi, p in enumerate(paras):
    for s in split_sentences(p):
        sents.append((pi, s))

norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())
sw = [(si, w, norm(w)) for si, (_, s) in enumerate(sents) for w in s.split()]
sm = difflib.SequenceMatcher(None, [x[2] for x in sw], [norm(x["w"]) for x in asr], autojunk=False)
t = [None] * len(sw)
for blk in sm.get_matching_blocks():
    for k in range(blk.size):
        a = asr[blk.b + k]
        t[blk.a + k] = (a["s"], a["e"])
known = [i for i, v in enumerate(t) if v]
if not known:
    sys.exit("timings: no words matched the transcript")
for i in range(len(t)):  # interpolate unmatched words between matched neighbours
    if t[i] is None:
        p = max([k for k in known if k < i], default=None)
        n = min([k for k in known if k > i], default=None)
        if p is None:
            t[i] = (t[n][0], t[n][0])
        elif n is None:
            t[i] = (t[p][1], t[p][1])
        else:
            x = t[p][1] + (t[n][0] - t[p][1]) * (i - p) / (n - p)
            t[i] = (x, x)

out = []
for si, (pi, s) in enumerate(sents):
    ws = [{"w": sw[i][1], "s": round(t[i][0], 3), "e": round(t[i][1], 3)} for i in range(len(sw)) if sw[i][0] == si]
    out.append({"i": si, "para": pi, "text": s, "start": ws[0]["s"], "end": ws[-1]["e"], "words": ws})
json.dump(out, open(out_path, "w"), indent=1)
json.dump({"matched": len(known), "total": len(sw), "asr": " ".join(x["w"] for x in asr)}, open(out_path + ".meta.json", "w"))
print(f"timings: {len(known)}/{len(sw)} words matched, {len(out)} sentences, {len(paras)} paragraphs")
