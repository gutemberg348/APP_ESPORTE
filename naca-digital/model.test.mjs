import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,act,totals} from './dist/model.mjs';
test('daily check-in is granted once per day without mutating previous state',()=>{
 const before=initial(),s=act(before,'checkin',{day:'2026-10-12'});
 assert.equal(s.points,1310);assert.equal(before.points,1280);
 assert.throws(()=>act(s,'checkin',{day:'2026-10-12'}));
 assert.equal(act(s,'checkin',{day:'2026-10-13'}).points,1340);
});
test('quiz result is bounded and cannot grant points twice',()=>{
 assert.throws(()=>act(initial(),'quiz',{score:9}));
 const s=act(initial(),'quiz',{score:3});assert.equal(s.points,1400);
 assert.throws(()=>act(s,'quiz',{score:3}));
});
test('redemption spends available points only and cannot repeat',()=>{
 const s=act(initial(),'redeem',{id:'treino',code:'EXP-1'});
 assert.equal(s.points,480);assert.equal(s.xp,1280);
 assert.throws(()=>act(s,'redeem',{id:'treino'}));
 assert.throws(()=>act(s,'redeem',{id:'campo'}));
});
function purchase(partner='mercado',amount=100){
 const s=act(initial(),'voucher',{id:partner,code:'NACA-TEST',now:1000});
 return act(s,'validate',{partner,code:'naca-test',amount,now:2000});
}
test('cashback remains pending until confirmed; duplicate confirmation fails',()=>{
 const p=purchase();assert.equal(totals(p).pending,5);assert.equal(totals(p).cashback,18.4);
 const c=act(p,'confirm',{id:'NACA-TEST'});assert.equal(totals(c).cashback,23.4);assert.equal(totals(c).pending,0);
 assert.throws(()=>act(c,'confirm',{id:'NACA-TEST'}));
});
test('reversal removes cashback or discount and cannot repeat',()=>{
 const c=act(purchase(),'confirm',{id:'NACA-TEST'});
 const r=act(c,'reverse',{id:'NACA-TEST'});assert.equal(totals(r).cashback,18.4);
 assert.throws(()=>act(r,'reverse',{id:'NACA-TEST'}));
 const d=purchase('cafe');assert.equal(totals(d).economy,99.5);
 assert.equal(totals(act(d,'reverse',{id:'NACA-TEST'})).economy,84.5);
});
test('expired, mismatched, reused and inactive membership vouchers fail',()=>{
 const s=act(initial(),'voucher',{id:'mercado',code:'X',now:1000});
 assert.throws(()=>act(s,'validate',{partner:'cafe',code:'X',amount:100,now:2000}));
 assert.throws(()=>act(s,'validate',{partner:'mercado',code:'X',amount:100,now:901000}));
 assert.throws(()=>act(act(s,'cancel'),'validate',{partner:'mercado',code:'X',amount:100,now:2000}));
 assert.throws(()=>act(purchase(),'validate',{partner:'mercado',code:'NACA-TEST',amount:100,now:3000}));
});
test('invalid amounts fail and benefit caps are enforced',()=>{
 const s=act(initial(),'voucher',{id:'mercado',code:'X',now:1000});
 for(const amount of [0,-1,NaN,Infinity,10001])assert.throws(()=>act(s,'validate',{partner:'mercado',code:'X',amount,now:2000}));
 assert.equal(purchase('mercado',1000).transactions[0].cashback,20);
 assert.equal(purchase('posto',1000).transactions[0].cashback,15);
 assert.equal(purchase('cafe',1000).transactions[0].discount,30);
});
test('predictions lock before score reveal; no repeat reward',()=>{
 let s=act(initial(),'predict',{choice:'Nacional'});
 assert.throws(()=>act(s,'predict',{choice:'Adversário'}));
 s=act(s,'advance');assert.throws(()=>act(s,'predict',{choice:'Nacional'}));
 s=act(s,'advance');assert.equal(s.points,1360);
 s=act(act(s,'advance'),'advance');assert.equal(s.points,1360);
 assert.throws(()=>act(s,'advance'));
 assert.throws(()=>act(act(initial(),'advance'),'predict',{choice:'Nacional'}));
});
test('match quiz cannot be replayed',()=>{
 let s=act(initial(),'advance');s=act(s,'matchquiz',{correct:true});
 assert.equal(s.points,1320);assert.throws(()=>act(s,'matchquiz',{correct:true}));
});
test('ticket quantities, totals and membership are checked',()=>{
 const s=act(initial(),'ticket',{qty:3,sector:'Cadeira',id:'T'});
 assert.equal(s.tickets[0].total,180);
 assert.throws(()=>act(s,'ticket',{qty:5,sector:'Cadeira'}));
 assert.throws(()=>act(act(s,'cancel'),'ticket',{qty:1,sector:'Cadeira'}));
});
test('store checkout snapshots items and clears cart',()=>{
 let s=act(initial(),'cart',{id:'jersey',size:'G'});s=act(s,'cart',{id:'cap',size:'Único'});
 s=act(s,'checkout',{id:'P'});assert.equal(s.orders[0].total,209.8);assert.equal(s.orders[0].items.length,2);assert.equal(s.cart.length,0);
 assert.throws(()=>act(s,'checkout',{}));assert.throws(()=>act(s,'cart',{id:'jersey',size:'XX'}));
});
test('preferences and plans change; campaign stays in draft',()=>{
 const s=act(initial(),'prefs',{key:'ranking',value:false});assert.equal(s.prefs.ranking,false);
 assert.equal(act(s,'plan',{plan:'Família'}).monthly,69.9);
 assert.equal(act(s,'campaign',{title:'Em família',segment:'Família'}).campaigns[0].status,'Rascunho');
});
test('exact score prediction locks before play and is rewarded only at full time',()=>{
 for(const home of [-1,1.5,21,NaN])assert.throws(()=>act(initial(),'scorepredict',{home,away:0}));
 let s=act(initial(),'scorepredict',{home:1,away:0});
 assert.throws(()=>act(s,'scorepredict',{home:2,away:0}));
 for(let i=0;i<3;i++)s=act(s,'advance');
 assert.equal(s.points,1280);
 s=act(s,'advance');assert.equal(s.points,1780);assert.equal(s.xp,1780);assert.equal(s.scoreSettled,true);
 assert.throws(()=>act(s,'advance'));
 assert.throws(()=>act(act(initial(),'advance'),'scorepredict',{home:1,away:0}));
 let miss=act(initial(),'scorepredict',{home:0,away:0});
 for(let i=0;i<4;i++)miss=act(miss,'advance');
 assert.equal(miss.points,1280);assert.equal(miss.scoreSettled,true);
});
test('demo referral bonus requires an invite and can be granted once',()=>{
 assert.throws(()=>act(initial(),'referral'));
 const invited=act(initial(),'invite');assert.equal(invited.points,1280);
 const paid=act(invited,'referral');assert.equal(paid.points,1780);assert.equal(paid.xp,1780);
 assert.throws(()=>act(act(paid,'invite'),'referral'));
});
test('business drafts validate required fields and cannot become duplicate partners',()=>{
 const lead={id:'L1',kind:'application',name:'Loja Modelo',category:'Serviços',contact:'contato@exemplo.com'};
 assert.throws(()=>act(initial(),'lead',{...lead,contact:''}));
 assert.throws(()=>act(initial(),'lead',{...lead,category:'inválida'}));
 const draft=act(initial(),'lead',lead);assert.equal(draft.leads[0].status,'Rascunho');
 assert.throws(()=>act(draft,'lead',{...lead,id:'L2',name:' loja modelo '}));
 const reviewed=act(draft,'reviewlead',{id:'L1'});assert.equal(reviewed.leads[0].status,'Em análise');
 assert.equal(reviewed.points,1280);assert.throws(()=>act(reviewed,'reviewlead',{id:'L1'}));
});
test('star voting has a single valid choice and profile input is bounded',()=>{
 assert.throws(()=>act(initial(),'starvote',{choice:'Outro'}));
 const voted=act(initial(),'starvote',{choice:'Goleiro'});
 assert.throws(()=>act(voted,'starvote',{choice:'Camisa 9'}));assert.equal(voted.points,1280);
 assert.throws(()=>act(initial(),'profile',{name:' '}));
 assert.throws(()=>act(initial(),'profile',{name:'A'.repeat(81)}));
 assert.equal(act(initial(),'profile',{name:'  Ana Lima  ',city:'Patos'}).profile.name,'Ana Lima');
});
test('new seating options retain accurate totals and reject unknown sectors',()=>{
 for(const [sector,price] of [['Cadeiras Cativas',80],['Arquibancada Sol',40],['Arquibancada Sombra',60]]){
  assert.equal(act(initial(),'ticket',{id:sector,sector,qty:3}).tickets[0].total,price*3);
 }
 assert.throws(()=>act(initial(),'ticket',{sector:'Outro',qty:1}));
});
