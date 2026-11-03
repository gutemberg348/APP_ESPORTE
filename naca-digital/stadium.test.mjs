import test from 'node:test';
import assert from 'node:assert/strict';
import {createStadiumWakeLock} from './dist/stadium.mjs';

function setup(request){
 const listeners=new Map(),statuses=[];
 const doc={visibilityState:'visible',addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const controller=createStadiumWakeLock({document:doc,navigator:request?{wakeLock:{request}}:{},onStatus:x=>statuses.push(x)});
 return {controller,statuses,doc,listeners,visibility(state){doc.visibilityState=state;listeners.get('visibilitychange')?.();}};
}
function sentinel(){const listeners=new Map();return {released:false,calls:0,addEventListener:(name,fn)=>listeners.set(name,fn),async release(){this.calls++;this.released=true;listeners.get('release')?.();}};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('screen stays requested only while stadium is open, without duplicate acquisition',async()=>{
 const lock=sentinel();let calls=0;
 const s=setup(async type=>{assert.equal(type,'screen');calls++;return lock;});
 s.controller.open();s.controller.open();await flush();
 assert.equal(calls,1);assert.equal(s.statuses.at(-1),'active');
 s.controller.close();assert.equal(lock.calls,1);assert.equal(s.listeners.size,0);
});
test('a late successful request is released after the stadium closes',async()=>{
 let resolve;const lock=sentinel();const s=setup(()=>new Promise(r=>resolve=r));
 s.controller.open();s.controller.close();resolve(lock);await flush();
 assert.equal(lock.calls,1);assert.ok(!s.statuses.includes('active'));
});
test('hiding the app releases the screen and returning requests a fresh lock',async()=>{
 const locks=[];const s=setup(async()=>{const lock=sentinel();locks.push(lock);return lock;});
 s.controller.open();await flush();s.visibility('hidden');assert.equal(locks[0].calls,1);
 s.visibility('visible');await flush();assert.equal(locks.length,2);assert.equal(s.statuses.at(-1),'active');
 s.controller.close();assert.equal(locks[1].calls,1);
});
test('old pending requests cannot replace the lock from a newer opening',async()=>{
 const resolvers=[];const s=setup(()=>new Promise(r=>resolvers.push(r)));
 const old=sentinel(),current=sentinel();
 s.controller.open();s.controller.close();s.controller.open();
 resolvers[1](current);await flush();resolvers[0](old);await flush();
 assert.equal(old.calls,1);assert.equal(current.calls,0);assert.equal(s.statuses.at(-1),'active');
 s.controller.close();assert.equal(current.calls,1);
});
test('unsupported or rejected wake requests leave the mode usable without retry loops',async()=>{
 const unsupported=setup();unsupported.controller.open();assert.equal(unsupported.statuses.at(-1),'unsupported');unsupported.controller.close();
 let calls=0;const denied=setup(async()=>{calls++;throw new Error('NotAllowedError');});
 denied.controller.open();await flush();assert.equal(denied.statuses.at(-1),'unavailable');assert.equal(calls,1);
 denied.controller.close();assert.equal(denied.listeners.size,0);
});
