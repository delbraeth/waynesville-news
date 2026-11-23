import fs from "fs";
const UA={"User-Agent":"waynesville-news-video-sample/0.1"};
const G=JSON.parse(fs.readFileSync("data/geo.json"));
const route=JSON.parse(fs.readFileSync("data/route.json")).routes[0].geometry.coordinates;
const sr73=JSON.parse(fs.readFileSync("data/sr73.json"))[0];
const W=720,H=600;
const wx=(lon,z)=>(lon+180)/360*256*2**z;
const wy=(lat,z)=>{const s=Math.sin(lat*Math.PI/180);return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*256*2**z;};
async function tile(z,x,y){const f=`tiles/${z}-${x}-${y}.png`;if(!fs.existsSync(f)){const r=await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`,{headers:UA});if(!r.ok)throw new Error(r.status+" "+f);fs.writeFileSync(f,Buffer.from(await r.arrayBuffer()));await new Promise(r=>setTimeout(r,150));}return f;}
async function map(spec){const PAD=spec.pad??90;
  const pts=[...(spec.fit||[])];
  let z=spec.maxZoom||16;
  const ext=(z)=>{const xs=pts.map(p=>wx(p[0],z)),ys=pts.map(p=>wy(p[1],z));return [Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];};
  while(z>3){const [a,b,c,d]=ext(z); if(b-a<=W-2*PAD && d-c<=H-2*PAD) break; z--;}
  const [a,b,c,d]=ext(z); const cx=(a+b)/2, cy=(c+d)/2+ (spec.dy||0); const ox=cx-W/2, oy=cy-H/2;
  const P=([lon,lat])=>[wx(lon,z)-ox, wy(lat,z)-oy];
  let imgs="";
  for(let tx=Math.floor(ox/256);tx<=Math.floor((ox+W)/256);tx++) for(let ty=Math.floor(oy/256);ty<=Math.floor((oy+H)/256);ty++){
    const f=await tile(z,tx,ty); imgs+=`<img src="${f}" style="left:${tx*256-ox}px;top:${ty*256-oy}px">`;}
  let svg="";
  for(const l of spec.lines||[]){const d=l.coords.map((p,i)=>(i?"L":"M")+P(p).map(v=>v.toFixed(1)).join(" ")).join("");
    svg+=`<path d="${d}" class="casing" pathLength="1"/><path d="${d}" class="line draw" pathLength="1" data-r="${l.r}" data-o="${l.o||0}" data-dur="${l.dur||2.5}"/>`;}
  let pins="";
  for(const p of spec.pins||[]){const [x,y]=P([p.lon,p.lat]);
    pins+=`<div class="pin ${p.home?'home':''} it" data-r="${p.r}" data-o="${p.o||0}" style="left:${x}px;top:${y}px"><i></i><span class="${p.side||'r'}">${p.label}</span></div>`;}
  return `<div class="map"><div class="tiles">${imgs}</div><svg width="${W}" height="${H}">${svg}</svg>${pins}<div class="attr">© OpenStreetMap contributors</div></div>`;
}
const g=k=>[G[k].lon,G[k].lat];
const out={};
out.semi=await map({fit:[g("whs"),g("teays")],lines:[{coords:route,r:10,o:.5,dur:3}],
  pins:[{...G.whs,label:"Waynesville",r:10,home:1,side:"l"},{...G.teays,label:"Teays Valley HS, Ashville",r:10,o:.6,side:"l"}]});
out.lights=await map({pad:120,fit:[g("carillon"),g("smithpark"),g("renpark"),g("kings"),g("clifton"),g("hillsboro")],
  pins:[{...G.carillon,label:"A Carillon Christmas",r:14,side:"l"},{...G.smithpark,label:"Light Up Middletown",r:14,o:.55,side:"b"},
   {...G.renpark,label:"Yuletide Village",r:15,o:.2,side:"r"},{...G.kings,label:"WinterFest",r:15,o:.55,side:"r"},{...G.clifton,label:"Clifton Mill",r:15,o:.8,side:"r"},{...G.hillsboro,label:"Hillsboro",r:17,side:"l"}]});
out.gov=await map({fit:[g("lebanon"),g("waynesville")],pins:[{...G.lebanon,label:"Commissioners, Lebanon",r:23,o:.3,side:"r"},{...G.waynesville,label:"Waynesville",r:23,home:1,side:"r"}]});
out.roads=await map({pad:30,fit:[sr73[0],sr73[sr73.length-1],g("waynesville")],lines:[{coords:sr73,r:26,o:.1,dur:4}],
  pins:[{...G.waynesville,label:"Waynesville",r:26,home:1,side:"r"},{lon:sr73[0][0],lat:sr73[0][1],label:"Red Lion-Five Points Rd.",r:26,o:.3,side:"r"},{lon:sr73.at(-1)[0],lat:sr73.at(-1)[1],label:"Harveysburg Rd.",r:26,o:.45,side:"l"}]});
out.downtown=await map({fit:[[-84.0905,39.5318],[-84.0835,39.5275]],maxZoom:16,pins:[{...G.downtown,label:"Main Street",r:27,o:.3,side:"r"}]});
fs.writeFileSync("data/maps.json",JSON.stringify(out));
fs.writeFileSync("maps.js","window.MAPS="+JSON.stringify(out)+";");
console.log(Object.keys(out), fs.readdirSync("tiles").length,"tiles");
