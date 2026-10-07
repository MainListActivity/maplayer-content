import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderStill, renderMedia, selectComposition} from '@remotion/renderer';
import {AmbientSchema, SceneFileSchema} from '../src/spec';
import {ambientMotion} from '../src/lib/ambient';
import {ROOT} from './common';

assert.equal(AmbientSchema.safeParse({type:'rotate'}).success, false);
assert.equal(AmbientSchema.safeParse({type:'drift'}).success, false);
for (const invalid of [{type:'rotate',degPerSec:Infinity}, {type:'rotate',degPerSec:1,pivot:{x:2,y:0}}, {type:'drift',dx:2}])
  assert.equal(AmbientSchema.safeParse(invalid).success, false);
assert.equal(SceneFileSchema.safeParse({layers:[{id:'a',file:'a.png'}],ambient:[{type:'drift',layer:'missing',dx:.1}]}).success, false);
assert.equal(SceneFileSchema.safeParse({layers:[{id:'a',file:'a.png'}],ambient:[{type:'rotate',degPerSec:1},{type:'rotate',layer:'a',degPerSec:2}]}).success, false);
assert.ok(SceneFileSchema.safeParse({layers:[{file:'a.png'}],ambient:[{type:'pulse'}]}).success);
const drift=AmbientSchema.parse({type:'drift',dx:.1,dy:-.05});
assert.equal(ambientMotion([drift],0,640,360)?.transform,ambientMotion([drift],20,640,360)?.transform);
assert.equal(ambientMotion([AmbientSchema.parse({type:'pulse'})],1,640,360),null);
for (const [w,h] of [[640,360],[360,640]]) for (const pivot of [{x:0,y:0},{x:.5,y:.5},{x:1,y:1}]) {
  const a=AmbientSchema.parse({type:'rotate',degPerSec:90,pivot});
  for (let t=0;t<4;t+=.125) {
    const plane=ambientMotion([a,drift],t,w,h)!;
    const angle=t*Math.PI/2,dx=(((t*.1+.5)%1+1)%1-.5)*w,dy=(((t*-.05+.5)%1+1)%1-.5)*h;
    for (const x of [0,w]) for (const y of [0,h]) {
      const qx=x-dx-pivot.x*w,qy=y-dy-pivot.y*h;
      const ix=Math.cos(angle)*qx+Math.sin(angle)*qy+pivot.x*w;
      const iy=-Math.sin(angle)*qx+Math.cos(angle)*qy+pivot.y*h;
      assert.ok(ix>=plane.left && ix<=plane.left+plane.width && iy>=plane.top && iy<=plane.top+plane.height,'rotated tile plane must cover corners');
    }
  }
}
console.log('PASS ambient schema, targets, periodic drift and all-angle corner coverage');

const serveUrl=await bundle({entryPoint:join(ROOT,'pipeline/fixtures/ambient/entry.tsx'),publicDir:join(ROOT,'pipeline/fixtures/ambient/public')});
const out=process.env.AMBIENT_EVIDENCE_DIR ?? mkdtempSync(join(tmpdir(),'ambient-test-'));
for (const mode of ['rotate','drift','both','global','static','pan']) {
  const inputProps={mode};
  const composition=await selectComposition({serveUrl,id:'ambient',inputProps});
  const frames=[];
  for (const frame of [0,48]) {
    const path=join(out,`${mode}-${frame}.png`);
    await renderStill({serveUrl,composition,inputProps,frame,output:path});frames.push(readFileSync(path));
  }
  assert.equal(frames[0].equals(frames[1]),mode==='static',`${mode}: incorrect frame motion`);
  console.log(`PASS rendered ${mode} motion/legacy control`);
}
if (process.env.AMBIENT_EVIDENCE_DIR) {
  const inputProps={mode:'pan'};
  const composition=await selectComposition({serveUrl,id:'ambient',inputProps});
  await renderMedia({serveUrl,composition,inputProps,codec:'h264',outputLocation:join(out,'ambient-demo.mp4'),concurrency:2});
}
console.log(`ambient evidence: ${out}`);
