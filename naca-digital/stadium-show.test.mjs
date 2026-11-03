import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizedPhase,createShowClock,SHOW_PERIOD_MS} from './dist/stadium-show.mjs';

test('dois aparelhos abertos em momentos diferentes exibem a mesma fase pelo horário comum',()=>{
  const openedAt=[1000,9000];
  assert.equal(synchronizedPhase(24000),'green');
  assert.deepEqual(openedAt.map(()=>synchronizedPhase(29000)),['green','green']);
  assert.equal(synchronizedPhase(30000),'white');
  assert.equal(synchronizedPhase(2*SHOW_PERIOD_MS),'green');
});

test('página oculta pausa a atualização e retoma na fase atual sem acumular atrasos',()=>{
  let now=0,callback,cleared=false,visible='visible',listener;
  const phases=[];
  const doc={get visibilityState(){return visible;},addEventListener:(_,cb)=>listener=cb,removeEventListener:()=>listener=null};
  const clock=createShowClock({now:()=>now,interval:cb=>(callback=cb,1),cancel:()=>cleared=true,document:doc,onPhase:phase=>phases.push(phase)});
  clock.start();assert.deepEqual(phases,['green']);
  visible='hidden';now=7100;callback();assert.deepEqual(phases,['green']);
  visible='visible';listener();assert.deepEqual(phases,['green','white']);
  clock.stop();assert.equal(cleared,true);assert.equal(listener,null);
});
