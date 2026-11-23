import sys
import json, numpy as np
from faster_whisper import WhisperModel
audio = np.fromfile(sys.argv[1], dtype=np.float32)
m = WhisperModel("base.en", device="cpu", compute_type="int8")
segs, _ = m.transcribe(audio, word_timestamps=True, beam_size=5)
words = [{"w": w.word, "s": round(w.start,2), "e": round(w.end,2)} for s in segs for w in s.words]
json.dump(words, open(sys.argv[2], "w"))
print(len(words), words[:6], words[-4:])
