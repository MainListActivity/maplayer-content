import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {deflateSync, inflateSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderStill, renderMedia, selectComposition, RenderInternals} from '@remotion/renderer';
import {FaceTrackSchema, MediaLayerSchema, buildTimeline, EpisodeSchema} from '../src/spec';
import {mediaSequenceIndex} from '../src/lib/MediaLayer';
import {fixtureShot, manifest} from './fixtures/performance/input';

const out = process.env.PERFORMANCE_EVIDENCE_DIR ?? mkdtempSync(join(tmpdir(), 'performance-'));
const pub = join(out, 'public');
const parts = join(pub, 'episodes/fixture/assets/characters/actor/parts');
const actions = join(pub, 'episodes/fixture/assets/characters/actor/actions');
const props = join(pub, 'episodes/fixture/assets/props');
const scenes = join(pub, 'episodes/fixture/assets/scenes');
const audio = join(pub, 'episodes/fixture/audio');
for (const dir of [pub, parts, actions, props, audio, scenes]) mkdirSync(dir, {recursive: true});
const json = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 2));
// 小型确定性 RGBA PNG 编码器，夹具无外部绘图库依赖。
const crc = (b: Buffer) => {let c = 0xffffffff; for (const v of b) {c ^= v; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);} return (c ^ 0xffffffff) >>> 0;};
const chunk = (name: string, data: Buffer) => {const b = Buffer.concat([Buffer.from(name), data]); const len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(b)); return Buffer.concat([len, b, sum]);};
const png = (path: string, w: number, h: number, color: number[], inset = 0) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * (w * 4 + 1) + 1 + x * 4;
    if (x >= inset && x < w - inset && y >= inset && y < h - inset) raw.set(color, i);
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  writeFileSync(path, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
};
for (const [name,w,h,color] of [
  ['body',80,160,[60,80,100,255]], ['head',80,80,[170,150,120,255]],
  ['hand',12,60,[255,255,255,255]], ['gaze',20,8,[255,0,0,255]], ['gaze-right',20,8,[0,255,0,255]],
  ['lid-open',20,8,[255,255,255,255]], ['lid-closed',20,8,[0,0,0,255]],
  ['brow',28,5,[255,255,0,255]], ['brow-raised',28,5,[255,0,255,255]],
  ['closed',20,4,[0,0,255,255]], ['open',20,12,[255,0,0,255]], ['wide',20,12,[0,255,255,255]],
] as [string,number,number,number[]][]) png(join(parts, `${name}.png`), w,h,color);
json(join(parts, 'parts.json'), {size: [200,300], parts: [
  {id:'body',file:'body.png',at:[60,130],pivot:[100,200]},
  {id:'head',file:'head.png',at:[60,50],pivot:[100,130],parent:'body',depth:1},
  {id:'gaze',file:'gaze.png',at:[75,80],pivot:[100,130],parent:'head',depth:2},
  {id:'brow',file:'brow.png',at:[75,68],pivot:[100,130],parent:'head',depth:2},
  {id:'lid',file:'lid-open.png',at:[104,80],pivot:[100,130],parent:'head',depth:2},
  {id:'mouth',file:'closed.png',at:[85,108],pivot:[100,130],parent:'head',depth:2},
  {id:'hand',file:'hand.png',at:[140,140],pivot:[146,140],points:{grip:[146,194]},depth:2},
]});
json(join(actions, 'gesture.json'), {durationSec:3,loop:false,hold:true,tracks:{hand:[{t:0,rot:0,ease:'linear'},{t:1,rot:-50,ease:'hold'},{t:2,rot:-50},{t:3,rot:0}]}});
png(join(scenes, 'backdrop.png'),400,300,[80,40,80,255]);
// 核心中心标记与手端重合，彩色区别于手部白色。
png(join(props, 'core.png'), 12,12,[255,128,0,255]);
for (const [name, color] of [['red',[255,0,0,255]],['green',[0,255,0,255]],['blue',[0,0,255,255]]] as [string,number[]][]) png(join(pub, `seq-${name}.png`),200,150,color,30);
// 0.75 秒有声源，作为对白与预制源音轨的可检测标记。
const sampleRate = 48000, samples = sampleRate * .75, wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(sampleRate,24); wav.writeUInt32LE(sampleRate*2,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(samples*2,40);
for (let i=0;i<samples;i++) wav.writeInt16LE(Math.round(Math.sin(i/sampleRate*2*Math.PI*440)*12000),44+i*2);
writeFileSync(join(pub,'tone.wav'),wav);writeFileSync(join(audio,'tone.wav'),wav);
for (const mode of ['face','contact','media']) json(join(out,`${mode}-input.json`),fixtureShot(mode));
assert.equal(FaceTrackSchema.safeParse({role:'mouth',keys:[{t:0,file:'open.png'}]}).success,false);
assert.equal(FaceTrackSchema.safeParse({keys:[{t:1,file:'a'},{t:0,file:'b'}]}).success,false);
const layer = MediaLayerSchema.parse({source:{type:'sequence',files:['a','b','c'],fps:1},from:12,durationFrames:48,trimStartSec:.5});
assert.deepEqual([0,24,47].map(f=>mediaSequenceIndex(layer,f,24)),[0,1,2]);
const tl=buildTimeline(EpisodeSchema.parse({id:'fixture',title:'test'}),[fixtureShot('face')],manifest)[0];
assert.deepEqual(tl.lineFrames,[0,30]);assert.deepEqual(tl.lineDurationFrames,[18,24]);
console.log('PASS facial contract, sequence trim mapping, dialogue gaps/durations');

const serveUrl=await bundle({entryPoint:resolve('pipeline/fixtures/performance/entry.tsx'),publicDir:pub});
const source=await selectComposition({serveUrl,id:'source'});
await renderMedia({serveUrl,composition:source,inputProps:{alpha:false},codec:'h264',outputLocation:join(pub,'source.mp4'),concurrency:2});
const alphaSource=await selectComposition({serveUrl,id:'source',inputProps:{alpha:true}});
await renderMedia({serveUrl,composition:alphaSource,inputProps:{alpha:true},codec:'vp8',pixelFormat:'yuva420p',imageFormat:'png',outputLocation:join(pub,'alpha.webm'),concurrency:2});
// bundle 的 public 目录是快照；生成源之后重打包，保证读到真实源。
const serve=await bundle({entryPoint:resolve('pipeline/fixtures/performance/entry.tsx'),publicDir:pub});
const comp=await selectComposition({serveUrl:serve,id:'performance'});
const ff=RenderInternals.getExecutablePath({type:'ffmpeg',indent:false,logLevel:'error',binariesDirectory:null});
const env={...process.env,DYLD_LIBRARY_PATH:dirname(ff)};
const run=(args:string[])=>execFileSync(ff,['-hide_banner','-loglevel','error',...args],{env,maxBuffer:32*1024*1024});
const pixels=(file:string)=>{
  const bytes=readFileSync(file), chunks:Buffer[]=[];
  let w=0,h=0,bpp=0;
  for(let off=8;off<bytes.length;) {
    const len=bytes.readUInt32BE(off),name=bytes.toString('ascii',off+4,off+8),data=bytes.subarray(off+8,off+8+len);
    if(name==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);assert.equal(data[8],8);bpp=data[9]===6?4:3;assert.ok(data[9]===6||data[9]===2);}
    if(name==='IDAT')chunks.push(data);off+=len+12;
  }
  assert.equal(w,400);assert.equal(h,300);
  const raw=inflateSync(Buffer.concat(chunks)),decoded=Buffer.alloc(w*h*bpp),rgb=Buffer.alloc(w*h*3),stride=w*bpp;
  const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<h;y++)for(let x=0;x<stride;x++){
    const f=raw[y*(stride+1)],a=x>=bpp?decoded[y*stride+x-bpp]:0,b=y>0?decoded[(y-1)*stride+x]:0,c=y>0&&x>=bpp?decoded[(y-1)*stride+x-bpp]:0;
    decoded[y*stride+x]=(raw[y*(stride+1)+x+1]+(f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;
  }
  for(let i=0;i<w*h;i++)rgb.set(decoded.subarray(i*bpp,i*bpp+3),i*3);
  return rgb;
};
const at=(buf:Buffer,x:number,y:number)=>[...buf.subarray((y*400+x)*3,(y*400+x)*3+3)];
const near=(actual:number[],expected:number[],tolerance=8)=>assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=tolerance),`pixel ${actual} expected ${expected}`);
const still=async(mode:string,frame:number)=>{
  const path=join(out,`${mode}-${frame}.png`);
  const selected = await selectComposition({serveUrl:serve,id:'performance',inputProps:{mode}});
  await renderStill({serveUrl:serve,composition:selected,inputProps:{mode},frame,output:path});return pixels(path);
};
// 拼合像素到画面：unit=.62，角色左上=(98,84)。身体姿态固定时脸独立切换。
const f6=await still('face',6),f24=await still('face',24),f36=await still('face',36),f60=await still('face',60);
near(at(f6,150,135),[255,0,0]);near(at(f36,150,135),[0,255,0]); // gaze
near(at(f6,150,127),[255,255,0]);near(at(f60,150,127),[255,0,255]); // brow
near(at(f6,155,157),[255,0,0]);near(at(f24,155,152),[0,0,255]);near(at(f36,155,157),[0,255,255]);near(at(f60,155,152),[0,0,255]); // mouth during gap & after
near(at(f6,167,135),[255,255,255]);near(at(f60,167,135),[0,0,0]); // eyelid
near(at(f6,155,220),at(f60,155,220),0); // 身体区域不伸缩
for (const image of [f24,f36,f60]) {
  for (let y=0;y<300;y++) for (let x=0;x<400;x++)
    if (!(x>=140 && x<=180 && y>=120 && y<=160)) near(at(image,x,y),at(f6,x,y),0);
} // 面部区域之外的全部像素完全一致，身体/手臂姿态固定
console.log('PASS actual facial pixels: independent gaze/brow/mouth, both silent intervals closed, body stable');
for(const mode of ['contact','contact-left']) for(const frame of [0,12,36,71]) {
  const image=await still(mode,frame);
  // 图像里橙色核心中心必须被白色手端包围/相邻。用实际像素距离而非 schema 自证。
  const orange:number[][]=[],white:number[][]=[];
  for(let y=0;y<300;y++)for(let x=0;x<400;x++) {const c=at(image,x,y);if(c[0]>245&&c[1]>115&&c[1]<145&&c[2]<10)orange.push([x,y]);if(c.every(v=>v>245))white.push([x,y]);}
  assert.ok(orange.length>4&&white.length>10,'hand and prop must be visible');
  const cx=.5+orange.reduce((a,p)=>a+p[0],0)/orange.length,cy=.5+orange.reduce((a,p)=>a+p[1],0)/orange.length;
  assert.ok(Math.min(...white.map(p=>Math.hypot(p[0]-cx,p[1]-cy)))<11,'rendered hand must touch prop edge');
  // 夹具几何的解析预期：手端绕 (146,140) 转，外层先倾斜再镜像，最后相机投影。
  const t=frame/24, smooth=(k:number)=>k*k*(3-2*k), angle=(t<1?-50*t:t<2?-50:-50*(1-smooth(t-2)))*Math.PI/180;
  const ax=146-54*Math.sin(angle),ay=140+54*Math.cos(angle),tilt=Math.sin(t*Math.PI*2.2)*1.4*Math.PI/180;
  const flip=mode==='contact-left'?-1:1,dx=((ax-100)*Math.cos(tilt)-(ay-300)*Math.sin(tilt))*.62*flip;
  const dy=((ax-100)*Math.sin(tilt)+(ay-300)*Math.cos(tilt))*.62;
  const wx=((mode==='contact-left'?.7:.4)+(mode==='contact-left'?-.3:.3)*t/3)*400+dx,wy=270-Math.abs(Math.sin(t*Math.PI*2.2))*186*.012+dy;
  const cam=smooth(frame/71),zoom=1+.25*cam;
  assert.ok(Math.hypot(cx-(200+zoom*(wx-(.5+.05*cam)*400)),cy-(150+zoom*(wy-150)))<1.2,`${mode} ${frame}: grip centroid drift`);
}
console.log('PASS rendered grip coordinates/contact at 8 motion/camera phases including mirrored walk');
for(const [frame,color] of [[12,[255,0,0]],[36,[0,255,0]],[59,[0,0,255]]] as [number,number[]][]) {
  const image=await still('media',frame);
  near(at(image,100,75),color);near(at(image,100,2),color);near(at(image,100,118),color); // cover 裁掉源顶部白条
  near(at(image,300,75),color);near(at(image,205,5),[80,40,80],0); // transparent sequence border
}
const start=await still('media',0),end=await still('media',60);
near(at(start,100,75),[80,40,80],0);near(at(end,100,75),[80,40,80],0); // start/end boundaries
near(at(start,200,225),[255,0,0]);near(at(start,10,160),[80,40,80],0); // alpha video center vs border
const again=await still('media',36);near(at(again,100,75),[0,255,0]);
console.log('PASS video/sequence first/middle/last source frames, cover crop, exclusive bounds, alpha video and PNG over colored background');
for(const mode of ['face','contact','media']) {
  const selected = await selectComposition({serveUrl:serve,id:'performance',inputProps:{mode}});
  await renderMedia({serveUrl:serve,composition:selected,inputProps:{mode},codec:'h264',outputLocation:join(out,`${mode}.mp4`),concurrency:2});
}
// 源含 tone，media 输出完全没有音轨；对白仅在自己的音频窗口出现。
const {parseFile}=await import('music-metadata');
assert.equal((await parseFile(join(out,'media.mp4'))).format.numberOfChannels,undefined);
assert.ok((await parseFile(join(pub,'source.mp4'))).format.numberOfChannels);
const pcmWav=run(['-i',join(out,'face.mp4'),'-vn','-f','wav','-acodec','pcm_s16le','-ac','1','-ar','48000','-']);
const pcm=pcmWav.subarray(pcmWav.indexOf(Buffer.from('data'))+8);
const rms=(from:number,to:number)=>{let sum=0,n=0;for(let i=Math.round(from*48000);i<Math.round(to*48000);i++){sum+=pcm.readInt16LE(i*2)**2;n++;}return Math.sqrt(sum/n);};
assert.ok(rms(.1,.6)>5000);assert.ok(rms(.85,1.15)<10);assert.ok(rms(1.35,1.8)>5000);assert.ok(rms(2.4,2.8)<10);
console.log('PASS rendered audio: source contains tone, inserted video muted, dialogue gap/tail silent');
console.log(`performance evidence: ${out}`);
