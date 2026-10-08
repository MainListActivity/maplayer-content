// Compile newly illustrated pieces and continuous IK into existing engine data.
// No renderer changes. Run from the task worktree: node public/episodes/ep05/_source/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)), ep=path.dirname(here);
const repo=path.resolve(here,'../../../..');
const ff=createRequire(repo+'/package.json')('ffmpeg-static');
const out=ep+'/assets/characters/rin/parts';fs.mkdirSync(out,{recursive:true});
const save=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
function decode(file){const b=fs.readFileSync(file),w=b.readUInt32BE(16),h=b.readUInt32BE(20);const r=spawnSync(ff,['-v','error','-i',file,'-f','rawvideo','-pix_fmt','rgba','-'],{maxBuffer:100e6});if(r.status)throw Error(r.stderr);return{w,h,d:r.stdout};}
function bounds(im,col,row,cols,rows){let l=im.w,t=im.h,r=0,b=0;for(let y=Math.floor(row*im.h/rows);y<Math.floor((row+1)*im.h/rows);y++)for(let x=Math.floor(col*im.w/cols);x<Math.floor((col+1)*im.w/cols);x++)if(im.d[(y*im.w+x)*4+3]>40){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}return{x:l,y:t,w:r-l+1,h:b-t+1};}
function normalize(im,b,start,end,length,file,flip=false,trim=1,minY=0){
  const sx=start[0]*b.w,sy=start[1]*b.h,ex=end[0]*b.w,ey=end[1]*b.h;
  const dx=ex-sx,dy=ey-sy,dist=Math.hypot(dx,dy),sc=length/dist,v=[dx/dist,dy/dist],u=[v[1],-v[0]];
  const proj=(x,y)=>[(u[0]*(x-sx)+u[1]*(y-sy))*sc,(v[0]*(x-sx)+v[1]*(y-sy))*sc];
  const corners=[[0,0],[b.w,0],[0,b.h*trim],[b.w,b.h*trim]].map(p=>proj(...p));
  const mx=Math.floor(Math.min(...corners.map(p=>p[0])))-3,my=Math.floor(Math.min(...corners.map(p=>p[1])))-3;
  const w=Math.ceil(Math.max(...corners.map(p=>p[0])))-mx+3,h=Math.ceil(Math.max(...corners.map(p=>p[1])))-my+3;
  const d=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const ax=(x+mx)/sc,ay=(y+my)/sc,localX=sx+u[0]*ax+v[0]*ay,localY=sy+u[1]*ax+v[1]*ay;
    if(localX<0||localX>=b.w-1||localY<b.h*minY||localY>=b.h*trim-1)continue;
    const xx=b.x+(flip?b.w-1-localX:localX),yy=b.y+localY,ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy;
    const weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy],coords=[[ix,iy],[ix+1,iy],[ix,iy+1],[ix+1,iy+1]];
    let alpha=0,rgba=[0,0,0];coords.forEach((p,i)=>{const at=(p[1]*im.w+p[0])*4,a=im.d[at+3]*weights[i];alpha+=a;for(let k=0;k<3;k++)rgba[k]+=im.d[at+k]*a;});
    const at=(y*w+x)*4;d[at+3]=Math.round(alpha);if(alpha>0)for(let k=0;k<3;k++)d[at+k]=Math.round(rgba[k]/alpha);
  }
  const r=spawnSync(ff,['-y','-v','error','-f','rawvideo','-pix_fmt','rgba','-s',`${w}x${h}`,'-i','-','-frames:v','1',out+'/'+file],{input:d,maxBuffer:1e6});if(r.status)throw Error(r.stderr);return{at:[mx,my],w,h};
}
const atlas=decode(here+'/parts-atlas.png'),heads=decode(here+'/heads-atlas.png');
const defs=[];
function piece(id,index,start,end,len,pivot,depth,parent,flip=false,trim=1,minY=0){const b=bounds(atlas,index%3,Math.floor(index/3),3,4),g=normalize(atlas,b,start,end,len,id+'.png',flip,trim,minY);defs.push({id,file:id+'.png',at:[pivot[0]+g.at[0],pivot[1]+g.at[1]],pivot,depth,...(parent?{parent}:{}),points:{}});return g;}
piece('torso',1,[.49,.12],[.54,.85],210,[250,235],5);defs[0].pivot=[250,480];
piece('arm-far',4,[.52,.10],[.54,.68],140,[177,283],1,'torso',false,.81);
piece('fore-far',5,[.52,.07],[.50,.79],125,[177,423],2,'arm-far');
piece('arm-near',2,[.51,.10],[.58,.70],140,[332,282],7,'torso',false,.81);
piece('fore-near',3,[.50,.07],[.58,.81],125,[332,422],8,'arm-near',false,.68);
piece('hand-near',3,[.50,.64],[.58,.81],30,[332,518],8.1,'fore-near',false,1,.60);
piece('thigh-far',9,[.60,.10],[.30,.89],175,[233,460],0);
piece('shin-far',10,[.55,.12],[.65,.89],175,[233,635],.1);
piece('boot-far',11,[.34,.20],[.34,1.20],76,[233,800],.2,null,true);
piece('thigh-near',6,[.55,.10],[.71,.88],175,[278,460],3);
piece('shin-near',7,[.48,.10],[.57,.90],175,[278,635],3.1);
piece('boot-near',8,[.31,.20],[.31,1.20],76,[278,800],3.2);
for(const [i,id]of ['head-neutral','head-listen','head-blink','head-soft'].entries()){
  const b=bounds(heads,i%2,Math.floor(i/2),2,2),g=normalize(heads,b,[.58,.96],[.58,1.96],180,id+'.png');
  defs.push({id,file:id+'.png',at:[250+g.at[0],235+g.at[1]],pivot:[250,235],parent:'torso',depth:10+i*.1,points:{}});
}
// Optional extra lips are compiled after their illustrated atlas is available.
if(fs.existsSync(here+'/mouth-atlas.png')){
 const lips=decode(here+'/mouth-atlas.png');for(const [i,id]of ['mouth-rest','mouth-open','mouth-o','mouth-smile'].entries()){
  const b=bounds(lips,i%2,Math.floor(i/2),2,2);
  const fixed=normalize(lips,b,[.5,.5],[.5,.5+b.w/b.h],30,id+'.png');
  defs.push({id,file:id+'.png',at:[267+fixed.at[0],184+fixed.at[1]],pivot:[250,235],parent:'torso',depth:15+i*.1,points:{}});
 }
}
save(out+'/parts.json',{size:[500,860],parts:defs});
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const ease=(t,a,b)=>smooth((t-a)/(b-a));
const samples=[];
for(const [file,start]of [['approach-0.mp3',5.25],['answer-0.mp3',13]]){
 const full=ep+'/audio/'+file;if(!fs.existsSync(full))continue;
 const r=spawnSync(ff,['-v','error','-i',full,'-ac','1','-ar','16000','-f','f32le','-'],{maxBuffer:4e6});if(r.status)throw Error(r.stderr);
 const env=[];for(let i=0;i<r.stdout.length/4;i+=667){let v=0,n=0;for(let j=i;j<Math.min(i+667,r.stdout.length/4);j++){const x=r.stdout.readFloatLE(j*4);v+=x*x;n++;}env.push(Math.sqrt(v/n));}
 const max=Math.max(...env);samples.push({start,env:env.map(x=>Math.min(1,x/max)),duration:r.stdout.length/4/16000});
}
function speech(t){for(const s of samples){const u=t-s.start;if(u>=0&&u<s.duration)return s.env[Math.min(s.env.length-1,Math.floor(u*24))];}return 0;}
const rad=180/Math.PI,unit=1080*.62*.96/860,velocity=.27*1920/3/unit;
const foot=(u,phase)=>{const q=((u+phase)%1+1)%1,span=.60*velocity;
 if(q<.60)return{x:span/2-velocity*q,y:800,rot:0,stance:true};
 const p=(q-.60)/.40;return{x:-span/2+span*smooth(p),y:800-67*Math.sin(Math.PI*p),rot:-13*Math.sin(Math.PI*p),stance:false};};
function ik(hx,hy,ax,ay){const dx=ax-hx,dy=ay-hy,d=Math.min(349.99,Math.hypot(dx,dy)),along=d/2,h=Math.sqrt(175**2-along**2),len=Math.hypot(dx,dy);const kx=hx+dx*along/len+dy*h/len,ky=hy+dy*along/len-dx*h/len;return{kx,ky,a:Math.atan2(-(kx-hx),ky-hy)*rad,b:Math.atan2(-(ax-kx),ay-ky)*rad};}
function pose(t){
 const u=Math.max(0,Math.min(3,t-.6)),walking=t>=.6&&t<3.6;
 const stop=Math.exp(-Math.max(0,t-3.6)*4)*Math.sin(Math.max(0,t-3.6)*9);
 const hipDy=walking?-3.5*Math.cos(u*4*Math.PI):(-3.5*(1-ease(t,3.6,4.3)));
 const breathe=.9*Math.sin(t*2.1),anticip=3*ease(t,0,.5)*(1-ease(t,.6,.9));
 const rot=walking?2.1+.6*Math.sin(u*2*Math.PI):2.1*(1-ease(t,3.6,4.3))+2.5*stop;
 const reach=ease(t,6.0,7.25)*(1-ease(t,10.5,12.3));
 const react=ease(t,4.1,4.55)*(1-ease(t,6.2,7));
 const nod=4.5*Math.sin(Math.PI*Math.max(0,Math.min(1,(t-13.05)/.9)));
 const torso={rot:rot-1.3*react,dx:anticip,dy:hipDy+breathe,scale:1+.002*Math.sin(t*2.1)};
 const p={torso};
 for(const [side,phase,hx]of [['near',0,278],['far',.5,233]]){
   const f=foot(u,phase),hipx=hx+(walking?2*Math.sin(u*2*Math.PI):0),hipy=460+hipDy;
   const k=ik(hipx,hipy,250+f.x,f.y);p['thigh-'+side]={rot:k.a,dx:hipx-hx,dy:hipy-460};p['shin-'+side]={rot:k.b,dx:k.kx-hx,dy:k.ky-635};p['boot-'+side]={rot:f.rot,dx:250+f.x-hx,dy:f.y-800};
 }
 const swing=walking?19*Math.sin(u*2*Math.PI):19*Math.sin(3*2*Math.PI)*(1-ease(t,3.6,4.2));
 p['arm-near']={rot:-swing-76*reach+3*react};p['fore-near']={rot:-9+19*reach+.24*swing};
 p['arm-far']={rot:swing+5*react};p['fore-far']={rot:-12-.35*swing};
 const wrist=ease(t,6.15,7.45)*(1-ease(t,10.7,12.5));p['hand-near']={rot:8*wrist-2.5*Math.sin(t*2.3)*wrist};
 let blink=0;for(const b of [2.7,4.72,8.3,12.65,16.3])blink=Math.max(blink,Math.max(0,1-Math.abs(t-b)/.10));
 const listen=ease(t,4.05,4.5)*(1-ease(t,11.75,12.3)),soft=ease(t,11.75,12.3);
 const headRot=-rot*.55-4*react+nod+.5*Math.sin(t*1.7-.4);
 for(const [id,opacity]of [['head-neutral',1-listen-soft],['head-listen',listen],['head-soft',soft],['head-blink',blink]])p[id]={rot:headRot,dy:.5*Math.sin(t*2.1-.3),opacity:Math.max(0,Math.min(1,id==='head-blink'?opacity:opacity*(1-blink)))};
 const amp=speech(t),open=smooth((amp-.08)/.58),round=.33*open*(.5+.5*Math.sin(t*12));
 for(const [id,opacity]of [['mouth-rest',(1-open)*(1-soft)],['mouth-open',open-round],['mouth-o',round],['mouth-smile',(1-open)*soft]])p[id]={rot:headRot,dy:.5*Math.sin(t*2.1-.3),opacity};
 return p;
}
const clipsDir=ep+'/assets/characters/rin/actions';fs.mkdirSync(clipsDir,{recursive:true});
for(const [name,start,dur]of [['approach',0,8.5],['answer',8.5,230/24]]){const tracks=Object.fromEntries(defs.map(p=>[p.id,[]]));for(let f=0;f<=Math.round(dur*24);f++){const p=pose(start+f/24);for(const id of Object.keys(tracks))tracks[id].push({t:f/24,...p[id],ease:'linear'});}save(clipsDir+'/'+name+'.json',{durationSec:dur,loop:false,hold:true,fps:24,tracks});}
save(ep+'/episode.json',{id:'ep05',title:'静默信标 · 我在（人物与动作重设计）',fps:24,width:1920,height:1080,letterbox:false,grain:false,voices:{rin:'zh-CN-XiaoxiaoNeural'},names:{rin:'凛'}});
const common={scene:'listening-room',transitionIn:'cut',props:[],shadow:{enabled:true,opacity:.27,size:.52,blur:13,contact:.72}};
save(ep+'/shots.json',{shots:[{...common,id:'approach',holdSec:2.5,padInSec:5.25,padOutSec:.75,camera:{from:{x:.5,y:.5,zoom:1.02},to:{x:.49,y:.5,zoom:1.07},ease:'easeInOut'},characters:[{id:'rin',x:.22,y:.94,scale:.96,action:'approach',moves:[{at:.6,durSec:3,to:{x:.49,y:.94},gait:'none',ease:'linear'}]}],dialogue:[{speaker:'rin',text:'有人在吗？'}]},{...common,id:'answer',holdSec:2.5,padInSec:4.5,padOutSec:2.5,camera:{from:{x:.53,y:.57,zoom:1.55},to:{x:.52,y:.57,zoom:1.62},ease:'easeInOut'},characters:[{id:'rin',x:.49,y:.94,scale:.96,action:'answer'}],dialogue:[{speaker:'rin',text:'我在。慢慢说。'}]}]});
// Deterministic world-space foot-contact check: stance ankle x + root motion is constant.
let residual=0,segments=0;for(const phase of [0,.5]){let previous=null;for(let f=0;f<=72;f++){const u=f/24,p=foot(u,phase),world=u*velocity+p.x;if(p.stance&&previous?.stance&&Math.abs(p.x-previous.x)<20)residual=Math.max(residual,Math.abs(world-previous.world)*unit);else if(p.stance)segments++;previous={...p,world};}}
save(here+'/motion-check.json',{fps:24,durationSec:434/24,manualGait:true,stanceSegments:segments,maxAdjacentStanceFootDriftPx:residual,pass:residual<.01,note:'Analytic ankle targets including root motion, not visual pixel tracking. Rig art contact and joint coverage require rendered inspection.'});
console.log('compiled',defs.length,'illustrated parts; two 24fps clips; foot target drift',residual);
