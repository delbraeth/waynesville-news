import json, re, difflib
asr=json.load(open("words.json"))
txt=open("spoken.txt").read().strip()
paras=[p.strip() for p in txt.split("\n\n")]
sents=[]
for p in paras:
    parts=re.split(r'(?<=[.!?])\s+(?=[A-Z])',p)
    out=[]
    for x in parts:
        if out and re.search(r'[ap]\.m\.$',out[-1]): out[-1]+=" "+x
        else: out.append(x)
    sents+=out
norm=lambda w: re.sub(r"[^a-z0-9]","",w.lower())
sw=[]; 
for i,s in enumerate(sents):
    for w in s.split(): sw.append((i,w,norm(w)))
a=[norm(x["w"]) for x in asr]
sm=difflib.SequenceMatcher(None,[x[2] for x in sw],a,autojunk=False)
t=[None]*len(sw)
for blk in sm.get_matching_blocks():
    for k in range(blk.size): t[blk.a+k]=(asr[blk.b+k]["s"],asr[blk.b+k]["e"])
# interpolate
known=[i for i,v in enumerate(t) if v]
for i in range(len(t)):
    if t[i] is None:
        p=max([k for k in known if k<i],default=None); n=min([k for k in known if k>i],default=None)
        if p is None: t[i]=(t[n][0],t[n][0])
        elif n is None: t[i]=(t[p][1],t[p][1])
        else:
            f=(i-p)/(n-p); x=t[p][1]+(t[n][0]-t[p][1])*f; t[i]=(x,x)
print("matched",len(known),"of",len(sw))
words=[{"sent":sw[i][0],"w":sw[i][1],"s":float(t[i][0]),"e":float(t[i][1])} for i in range(len(sw))]
res=[]
for i,s in enumerate(sents):
    ws=[w for w in words if w["sent"]==i]
    res.append({"i":i,"text":s,"start":ws[0]["s"],"end":ws[-1]["e"],"words":ws})
    print(i,round(ws[0]["s"],2),round(ws[-1]["e"],2),s[:55])
json.dump(res,open("sentences.json","w"),indent=1)
