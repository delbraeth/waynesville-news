const fs=require("fs"),{spawn}=require("child_process"),{chromium}=require("playwright");
const FPS=+process.env.FPS||30, DUR=+(process.env.DUR||188.39);
const sent=JSON.parse(fs.readFileSync(process.env.SENT||"data/sentences-2026-11-23.json"));
const buf=fs.readFileSync(process.env.F32||"ep.f32"); const a=new Float32Array(buf.buffer,buf.byteOffset,buf.length/4);
const per=16000/FPS, amp=[];
for(let i=0;i*per<a.length;i++){let s=0;const o=Math.floor(i*per);for(let j=0;j<per&&o+j<a.length;j++)s+=a[o+j]**2;amp.push(Math.sqrt(s/per));}
const sorted=[...amp].sort((x,y)=>x-y), p95=sorted[Math.floor(sorted.length*.95)];
const ampN=amp.map(v=>Math.pow(v/p95,0.8));
(async()=>{
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
 await p.goto("file://"+__dirname+"/"+(process.env.PAGE||"frame.html")); await p.evaluate(()=>document.fonts.ready);
 await p.evaluate(([s,am,f,d])=>setup(s,am,f,d),[sent,ampN,FPS,DUR]);
 if(process.env.STILLS){ for(const t of process.env.STILLS.split(",").map(Number)){ await p.evaluate(t=>render(t),t); await p.screenshot({path:`still-${t}.png`}); } await b.close(); return; }
 const ff=spawn("ffmpeg",["-y","-v","error","-f","image2pipe","-framerate",String(FPS),"-c:v","mjpeg","-i","-","-i",process.env.AUDIO||"ep.mp3","-c:v","libx264","-preset","medium","-crf","20","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-shortest","-movflags","+faststart",process.env.OUT||"sample.mp4"],{stdio:["pipe","inherit","inherit"]});
 const N=Math.ceil(DUR*FPS), t0=Date.now();
 for(let i=0;i<N;i++){ await p.evaluate(t=>render(t),i/FPS); const img=await p.screenshot({type:"jpeg",quality:92});
   if(!ff.stdin.write(img)) await new Promise(r=>ff.stdin.once("drain",r));
   if(i%600===0) console.log(`frame ${i}/${N} ${((Date.now()-t0)/1000).toFixed(0)}s`); }
 ff.stdin.end(); await new Promise(r=>ff.on("close",r)); await b.close(); console.log("done",(Date.now()-t0)/1000);
})();
