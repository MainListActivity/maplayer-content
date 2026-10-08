// Deterministic packaging only: split generated sheets, align canvases, write clips.
// Artwork is redrawn with imagegen; this script does not synthesize limbs or faces.
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync, copyFileSync} from 'node:fs';
import {join} from 'node:path';
const require = createRequire(import.meta.url);
const evidence = process.argv[2];
const sharp = require(join(evidence, '.tools/node_modules/sharp'));
const sheets = JSON.parse(process.argv[3]);
const root = 'public/episodes/ep02/assets/characters/rin';
const CW = 960, CH = 960, GROUND = 950;
const measurements = [];
async function split(source, cols, rows, names, referenceIndices) {
  const meta = await sharp(source).metadata();
  const boxes = [];
  for (let i = 0; i < names.length; i++) {
    const col=i%cols,row=Math.floor(i/cols);
    const left=Math.round(col*meta.width/cols),top=Math.round(row*meta.height/rows);
    const width=Math.round((col+1)*meta.width/cols)-left,height=Math.round((row+1)*meta.height/rows)-top;
    const png=await sharp(source).extract({left,top,width,height}).ensureAlpha().png().toBuffer();
    const {data,info}=await sharp(png).raw().toBuffer({resolveWithObject:true});
    // Generated cells can contain a few pixels from the neighbouring cell.
    // Find the principal connected sprite, so those fragments do not change its scale.
    const seen=new Uint8Array(width*height);let best={count:0,x0:width,y0:height,x1:-1,y1:-1};
    for(let start=0;start<seen.length;start++){
      if(seen[start]||data[start*4+3]<=32)continue;
      const stack=[start];seen[start]=1;let count=0,x0=width,y0=height,x1=-1,y1=-1;
      while(stack.length){const p=stack.pop(),x=p%width,y=Math.floor(p/width);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,q=ny*width+nx;if(nx<0||nx>=width||ny<0||ny>=height||seen[q]||data[q*4+3]<=32)continue;seen[q]=1;stack.push(q);}
      }
      if(count>best.count)best={count,x0,y0,x1,y1};
    }
    const {x0,y0,x1,y1}=best;
    if(x1<0 || (x0===0&&x1===width-1&&y0===0&&y1===height-1))throw Error(`Missing transparent background in ${names[i]}`);
    // Anchor to torso silhouette, rather than moving hands or the stride's bounding box.
    let sum=0,count=0;
    const band0=Math.round(y0+(y1-y0)*.38),band1=Math.round(y0+(y1-y0)*.48);
    for(let y=band0;y<=band1;y++){
      let a=width,b=-1;
      for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>128){a=Math.min(a,x);b=Math.max(b,x);}
      if(b>=a){sum+=(a+b)/2;count++;}
    }
    boxes.push({png,x0,y0,x1,y1,anchor:sum/count});
  }
  const hs=referenceIndices.map(i=>boxes[i].y1-boxes[i].y0+1).sort((a,b)=>a-b);
  const factor=870/hs[Math.floor(hs.length/2)];
  for(let i=0;i<boxes.length;i++){
    const b=boxes[i],w=Math.round((b.x1-b.x0+1)*factor),h=Math.round((b.y1-b.y0+1)*factor);
    const left=Math.round(CW/2-(b.anchor-b.x0)*factor),top=GROUND-h;
    if(left<0||left+w>CW||top<0)throw Error(`Canvas overflow ${names[i]} ${left},${top},${w},${h}`);
    const sprite=await sharp(b.png).extract({left:b.x0,top:b.y0,width:b.x1-b.x0+1,height:b.y1-b.y0+1}).resize(w,h).png().toBuffer();
    const target=join(root,`${names[i]}.png`);mkdirSync(join(target,'..'),{recursive:true});
    await sharp({create:{width:CW,height:CH,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:sprite,left,top}]).png().toFile(target);
    measurements.push({file:names[i],canvas:[CW,CH],ground:GROUND,bounds:[left,top,w,h],source});
  }
}
await split(sheets.walk,3,2,[1,2,3,4,5,6].map(i=>`v2/walk-${i}`),[0,1,2,3,4,5]);
await split(sheets.pose,3,3,['rest','anticipate','point','offer','lookback','sit-mid','sit','recover','side-rest'].map(n=>`v2/${n}`),[0,1,2,3,4,7,8]);
await split(sheets.expr,2,2,['calm','determined','surprised','smile'].map(n=>`v2/${n}`),[0,1,2,3]);
await split(sheets.reach,3,2,[1,2,3,4,5,6].map(i=>`v2/reach-${i}`),[0,1,2,3,4,5]);
copyFileSync(join(root,'v2/calm.png'),join(root,'default.png'));
const save=(name,frames,fps,loop=false)=>writeFileSync(join(root,`actions/${name}.json`),JSON.stringify({durationSec:frames.length/fps,loop,hold:!loop,fps,frames,tracks:{}},null,2)+'\n');
const copies=(f,n)=>Array(n).fill(`v2/${f}`);
save('walk-v2',[1,2,3,4,5,6].map(i=>`v2/walk-${i}`),8,true);
// Three 0.75s cycles, then planted stop, anticipation, reach and settle in one shot.
save('arrival-v2',[
 ...Array.from({length:3},()=>[1,2,3,4,5,6].map(i=>`v2/walk-${i}`)).flat(),
 ...copies('side-rest',3),...copies('rest',2),...copies('reach-1',2),...copies('reach-2',2),
 ...copies('reach-3',1),...copies('reach-4',1),...copies('reach-5',1),...copies('reach-6',8),
 ...copies('reach-5',1),...copies('reach-4',1),...copies('reach-3',1),...copies('reach-2',1),...copies('reach-1',4)
],8);
save('point-v2',[...copies('reach-1',2),...copies('reach-2',2),...copies('reach-3',1),...copies('reach-4',1),...copies('reach-5',1),...copies('reach-6',6)],8);
save('offer-v2',[...copies('rest',2),...copies('anticipate',2),...copies('offer',10)],8);
save('lookback-v2',[...copies('rest',3),...copies('anticipate',2),...copies('lookback',12)],8);
save('sit-v2',[...copies('rest',2),...copies('sit-mid',3),...copies('sit',12)],8);
save('emote-v2',['calm','determined','surprised','smile'].flatMap(n=>copies(n,8)),8);
mkdirSync(evidence,{recursive:true});writeFileSync(join(evidence,'asset-measurements.json'),JSON.stringify(measurements,null,2));
const thumbnails=[];
for(const m of measurements)thumbnails.push(await sharp(join(root,m.file+'.png')).resize(200,200).png().toBuffer());
await sharp({create:{width:6*200,height:Math.ceil(thumbnails.length/6)*200,channels:3,background:'#25303b'}}).composite(thumbnails.map((input,i)=>({input,left:(i%6)*200,top:Math.floor(i/6)*200}))).jpeg({quality:92}).toFile(join(evidence,'v2-poses.jpg'));
console.log(`Packaged ${measurements.length} RGBA sprites; ground ${GROUND}; clips written.`);
