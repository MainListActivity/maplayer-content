// Reproducible rendered hand review. Anatomy is judged from the images;
// numeric checks cover actual engine transforms and wrist attachments only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {PartsFileSchema, ActionClipSchema} from '../../../../src/spec';
import {evalParts, partAnchorWorld} from '../../../../src/lib/rig';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../../..');
const output=process.argv[2];
if(!output||!path.isAbsolute(output))throw Error('Pass an absolute evidence directory.');
fs.mkdirSync(output,{recursive:true});
const read=(f:string)=>JSON.parse(fs.readFileSync(f,'utf8'));
const base=path.resolve(here,'../assets/characters/rin');
const parts=PartsFileSchema.parse(read(base+'/parts/parts.json'));
const approach=ActionClipSchema.parse(read(base+'/actions/approach.json'));
const answer=ActionClipSchema.parse(read(base+'/actions/answer.json'));
let maxWristError=0,minDet=Infinity,maxOpacitySumError=0,maxVisibleNearHands=0;
for(let frame=0;frame<434;frame++){
 const t=frame/24,clip=t<8.5?approach:answer,local=t<8.5?t:t-8.5;
 const worlds=evalParts(parts,clip,local);
 for(const [hand,fore]of [['hand-near','fore-near'],['hand-near-edge','fore-near'],['hand-near-palm','fore-near'],['hand-far','fore-far']]){
  const h=partAnchorWorld(parts,worlds,hand,'wrist')!,w=partAnchorWorld(parts,worlds,fore,'wrist')!;
  maxWristError=Math.max(maxWristError,Math.hypot(h.x-w.x,h.y-w.y));
  const m=worlds.get(hand)!.m;minDet=Math.min(minDet,m[0]*m[3]-m[1]*m[2]);
 }
 const opacities=['hand-near','hand-near-edge','hand-near-palm'].map(id=>worlds.get(id)!.opacity);
 maxOpacitySumError=Math.max(maxOpacitySumError,Math.abs(opacities.reduce((sum,value)=>sum+value,0)-1));
 maxVisibleNearHands=Math.max(maxVisibleNearHands,opacities.filter(value=>value>1e-6).length);
}
const result={frames:434,maxWristAnchorGapRigUnits:maxWristError,minimumHandTransformDeterminant:minDet,maxNearHandOpacitySumError:maxOpacitySumError,maxSimultaneouslyVisibleNearHandViews:maxVisibleNearHands,pass:maxWristError<1e-8&&minDet>0&&maxOpacitySumError<1e-8&&maxVisibleNearHands===1,scope:'Checks production evalParts and named wrist anchors. Does not recognize anatomy or hand pixels. Inspect rendered snapshots for thumb sides, palm/back orientation and cuff overlap.'};
fs.writeFileSync(output+'/hand-geometry.json',JSON.stringify(result,null,2)+'\n');
if(!result.pass)throw Error(JSON.stringify(result));
console.log('Hand geometry:',result);
const frames=[0,48,96,156,162,168,180,232,264,270,273,276,294,396];
const serve=await bundle(repo+'/src/index.ts',undefined,{publicDir:repo+'/public'});
const inputProps={episodeId:'ep05'};
const comp=await selectComposition({serveUrl:serve,id:'episode',inputProps});
for(const frame of frames){
 await renderStill({composition:comp,serveUrl:serve,inputProps,frame,output:output+`/frame-${String(frame).padStart(3,'0')}.png`});
 console.log(`Hand review frame ${frame}: ${(frame/24).toFixed(3)}s`);
}
fs.writeFileSync(output+'/hand-review-frames.json',JSON.stringify(frames.map(frame=>({frame,timeSec:frame/24,file:`frame-${String(frame).padStart(3,'0')}.png`})),null,2)+'\n');
