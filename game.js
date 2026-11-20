'use strict';
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
const status = document.querySelector('#status'), pause = document.querySelector('#pause');
const media = document.querySelector('#cinematic');
const panel = document.querySelector('#panel'), box = document.querySelector('#box');
const W = 480, H = 720;
const jungle = new Image(), concept = new Image();
jungle.src = 'assets/jungle.png';
concept.src = 'assets/concept.png';
const ships = [
  {name:'고속형', speed:325, attack:9, hp:4, asset:'speed', bank:1.16, nose:24},
  {name:'화력형', speed:225, attack:14, hp:6, asset:'firepower', bank:.68, nose:20},
  {name:'균형형', speed:274, attack:11, hp:5, asset:'balanced', bank:.92, nose:23}
];
for(const model of ships) {
  model.image=new Image();
  model.image.onload=()=>{if(mode==='menu')drawShipPreviews();};
  model.image.src='assets/ships/'+model.asset+'.png';
}
const regularWaveCounts = [5,10,15,20,25,30,5,10,15];
const waves = regularWaveCounts.flatMap(count=>[count,1]);
const bossWave = waves.length-1;
const quizzesPerStage = regularWaveCounts.length-1;
const routes = [240,111,369];
const shotInterval = 1/3;
const supportRules = {
  supply:{interval:2,batch:3,cap:10},
  boss:{interval:7,batch:1,cap:3}
};
const wallCard = 7;
const enemySize = {normal:37,item:55,boss:185,drone:24};
const bossPatterns = ['정면 발사','범위 탄막','레이저 빔','추적 미사일','충돌형 소형기'];
const bossBurstDuration = 1.65;
const supplyBurstDuration = .76;
const cards = [
  ['공격력 증가','기본 공격력 +2'],['치명타 확률 증가','치명타 확률 +10%p'],
  ['치명타 피해 증가','치명타 배율 +0.25'],['직선 발사 탄환 개수 증가','보조 직선탄 +1 · 해당 탄환은 기본 피해의 15%'],
  ['사선 발사 탄환 개수 증가','사선 탄환 +2 · 해당 탄환은 기본 피해의 9%'],['보조 레이저','날개 끝 두 줄 · 기본 공격력의 10%씩 · 모든 적 관통'],
  ['기본 탄환 관통','통과하는 적 +1'],['기본 탄환 벽 반사','직선 탄환은 상단, 사선 탄환은 측면에서 무작위 각도로 한 번 반사 · 반사 후 피해 65%']
];
const craftScale=.65;
let stage=stages[0], beamTraces=[];
const keys = new Set();
let mode = 'menu', ship, player, wave, remaining, spawned, enemies, bullets, hazards, boosts, questions;
let elapsed, scroll, cooldown, spawnDelay, preparation, returnMode, misses, activeQuestion, drag, clearTime, hitEffects, supplyBurst, bossBurst, bossLaser;
let last = performance.now();
const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
function shuffle(values) {
  const result = [...values];
  for (let i=result.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
function overlay(next,html) {
  mode=next;
  status.hidden=['menu','title','intro','ending','finished'].includes(next);
  drag=null;
  if(player&&next==='fight')player.bankX=player.x;
  panel.hidden=!html;
  if (html) box.innerHTML=html;
  pause.hidden=!['fight','ready','supplyBurst','pause'].includes(mode);
  pause.textContent=mode==='pause'?'▶':'Ⅱ';
  pause.setAttribute('aria-label',mode==='pause'?'계속하기':'일시정지');
}
function titleScreen() {
  media.replaceChildren();
  media.hidden=true;
  overlay('title','<button class="start-screen" data-action="choose" aria-label="눌러서 시작"><img src="assets/start.gif" alt=""></button>');
}
function cinematic(kind, path, onDone) {
  overlay(kind,'<button class="skip-video" data-action="skip">건너뛰기</button>');
  const video=document.createElement('video');
  video.src=path;
  video.playsInline=true;
  video.preload='auto';
  video.setAttribute('aria-label',kind==='intro'?'인트로 영상':'엔딩 영상');
  let done=false;
  const finish=()=>{
    if(done||!media.contains(video))return;
    done=true;video.pause();media.replaceChildren();media.hidden=true;onDone();
  };
  video.addEventListener('ended',finish);
  video.addEventListener('error',finish);
  media.replaceChildren(video);
  media.hidden=false;
  box.querySelector('[data-action=skip]').onclick=finish;
  video.play().catch(()=>{video.controls=true;});
}
function finishGame() {
  overlay('finished','<h1>임무 완료</h1><p>분수 에이스, 귀환을 환영합니다!</p><button data-action="title">시작 화면으로</button>');
}
function menu() {
  overlay('menu','<h1>분수 에이스</h1><p>1스테이지 · 정글 상공</p><p class="small">방향키 또는 드래그로 이동 · 자동 발사</p><div class="choices">'+
    ships.map((item,i)=>'<button data-ship="'+i+'"><canvas class="ship-preview" width="64" height="56" aria-hidden="true"></canvas><span><strong>'+item.name+'</strong><br><span class="small">이동 '+item.speed+' · 공격 '+item.attack+' · 체력 '+item.hp+'</span></span></button>').join('')+'</div>');
  drawShipPreviews();
}
function drawShipPreviews() {
  box.querySelectorAll('.ship-preview').forEach((preview,index)=>{
    const previewContext=preview.getContext('2d');
    previewContext.clearRect(0,0,64,56);
    drawPlayerShip(previewContext,32,28,ships[index],0);
  });
}
function start(index,stageIndex=0) {
  ship=ships[index];
  stage=stages[stageIndex];
  loadStageArt(stage);
  if(stages[stageIndex+1])loadStageArt(stages[stageIndex+1]);
  beamTraces=[];
  keys.clear();
  player={x:240,y:596,hp:ship.hp,inv:0,criticalCharge:Math.random(),bank:0,bankX:240};
  enemies=[];bullets=[];hazards=[];hitEffects=[];boosts=cards.map(()=>0);
  questions=selectQuestions(stage.number,quizzesPerStage);
  wave=-1;elapsed=0;scroll=0;cooldown=shotInterval;supplyBurst=null;bossBurst=null;bossLaser=null;
  nextWave();
  ready();
}
function ready() {
  preparation=0.8;
  overlay('ready');
}
function nextWave() {
  wave++;
  remaining=waves[wave];spawned=0;spawnDelay=.35;
}
function spawn(reinforcement=false) {
  const boss=!reinforcement&&wave===bossWave, item=!reinforcement&&wave%2===1&&!boss;
  const lane=(spawned+Math.floor(wave/2))%routes.length;
  const x=boss||item?240:routes[lane]+([0,-22,22][Math.floor(spawned/3)%3]);
  const tier=reinforcement?Math.max(0,Math.floor(wave/2)-1):Math.floor(wave/2);
  const health=15+15*tier;
  const bossHealth=stage.number===8?5000:1000+300*(stage.number-1);
  const hp=boss?bossHealth:item?100+50*tier:health;
  const sideEntry=!boss&&!item&&[4,6,7].includes(stage.number);
  enemies.push({x,y:sideEntry?36:-95,boss,item,reinforcement,hp,max:hp,age:0,tier,lane,slot:spawned,baseX:x,flightTime:0,shot:item?1.55:.76+(spawned%4)*.29,
    fired:false, pattern:null, attackBag:[], attackClock:.85, supportClock:boss?5:supportRules.supply.interval});
  spawned++;
  if(!reinforcement)remaining--;
  if(item)spawnEscorts(supportRules.supply);
}
function spawnEscorts({batch,cap}) {
  const active=enemies.filter(enemy=>enemy.reinforcement&&enemy.hp>0).length;
  for(let i=0;i<Math.min(batch,cap-active);i++)spawn(true);
}
function updateReinforcements(leader,dt) {
  if(leader.boss&&!leader.entered)return;
  leader.supportClock-=dt;
  if(leader.supportClock>0)return;
  const rules=leader.boss?supportRules.boss:supportRules.supply;
  spawnEscorts(rules);
  leader.supportClock+=rules.interval;
}
function quiz() {
  const source=questions[(wave-1)/2];
  activeQuestion={...source,choices:shuffle(source.choices)};
  misses=0;
  showQuestion();
}
function showQuestion() {
  const {prompt,choices,hint,diagram}=activeQuestion;
  overlay('quiz','<h2>보급 상자 · 분수 문제</h2><p>'+prompt+'</p>'+diagram+
    (misses?'<p class="hint">한 번 더! '+hint+'</p>':'')+
    '<div class="options">'+choices.map(({html},i)=>'<button data-answer="'+i+'">'+html+'</button>').join('')+'</div>');
}
function cardLimit(index) {return index===wallCard||index===5?1:3;}
function showCards() {
  const offer=shuffle(cards.map((_,i)=>i).filter(i=>boosts[i]<cardLimit(i))).slice(0,3);
  overlay('cards','<h2>정답! 강화 카드 1장 선택</h2><div class="choices">'+offer.map(i=>
    '<button data-card="'+i+'"><strong>'+cards[i][0]+'</strong><br><span class="small">'+cards[i][1]+' · '+boosts[i]+' → '+(boosts[i]+1)+'회</span></button>').join('')+'</div>');
}
function resolveItem() {
  nextWave();
  ready();
}
function togglePause() {
  if(mode==='pause') overlay(returnMode);
  else if(['fight','ready','supplyBurst'].includes(mode)) {
    returnMode=mode;keys.clear();
    overlay('pause','<h2>일시정지</h2><button data-action="resume">계속하기</button>');
  }
}
pause.addEventListener('click',togglePause);
box.addEventListener('click',event=>{
  const data=event.target.closest('button')?.dataset;
  if(!data)return;
  if(data.ship!==undefined) start(Number(data.ship));
  if(data.action==='resume') togglePause();
  if(data.action==='choose')menu();
  if(data.action==='title')titleScreen();
  if(data.action==='retry-first')start(ships.indexOf(ship),0);
  if(data.action==='retry-current')start(ships.indexOf(ship),stage.number-1);
  if(data.action==='intro')cinematic('intro','assets/video/intro.mp4',titleScreen);
  if(data.action==='continue') resolveItem();
  if(data.answer!==undefined&&mode==='quiz') {
    if(activeQuestion.choices[Number(data.answer)]?.correct) showCards();
    else if(++misses===1) showQuestion();
    else overlay('failed','<h2>아이템 획득 실패</h2><p>정답은 '+activeQuestion.choices.find(choice=>choice.correct).html+'입니다.</p><button data-action="continue">다음 편대에 도전</button>');
  }
  if(data.card!==undefined&&mode==='cards') {
    const index=Number(data.card);
    if(!cards[index]||boosts[index]>=cardLimit(index))return;
    boosts[index]++;
    resolveItem();
  }
});
window.addEventListener('keydown',event=>{
  if(event.key.startsWith('Arrow')) {event.preventDefault();keys.add(event.key);}
  if(event.key==='Escape'&&!event.repeat) togglePause();
});
window.addEventListener('keyup',event=>keys.delete(event.key));
window.addEventListener('blur',()=>{keys.clear();if(['fight','ready','supplyBurst'].includes(mode))togglePause();});
canvas.addEventListener('pointerdown',event=>{
  if(mode!=='fight'&&mode!=='ready') return;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY};
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const scale=W/canvas.getBoundingClientRect().width;
  player.x=clamp(player.x+(event.clientX-drag.x)*scale,22,W-22);
  player.y=clamp(player.y+(event.clientY-drag.y)*scale,ship.nose*craftScale,H-18);
  drag.x=event.clientX;drag.y=event.clientY;
});
for(const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,event=>{
  if(drag?.id===event.pointerId)drag=null;
});
function fireWingLasers(damage) {
  let target=null;
  let nearest=Infinity;
  for(const enemy of enemies) {
    if(enemy.hp<=0||enemy.y<0)continue;
    const distance=Math.hypot(enemy.x-player.x,enemy.y-player.y);
    if(distance<nearest){nearest=distance;target=enemy;}
  }
  if(!target)return;
  const image=ship.image;
  const span=image.naturalWidth?Math.min(60,47*image.naturalWidth/image.naturalHeight)*craftScale:29;
  const hits=[];
  for(const side of [-1,1]) {
    const wing=side*span*.46;
    const angle=player.bank*.18;
    const localX=wing*(1-Math.abs(player.bank)*.16);
    const localY=wing*player.bank*.12;
    const x=player.x+localX*Math.cos(angle)-localY*Math.sin(angle);
    const y=player.y+localX*Math.sin(angle)+localY*Math.cos(angle);
    const heading=Math.atan2(target.y-y,target.x-x);
    const dx=Math.cos(heading),dy=Math.sin(heading);
    const edgeX=dx>0?(W-x)/dx:dx<0?-x/dx:Infinity;
    const edgeY=dy>0?(H-y)/dy:dy<0?-y/dy:Infinity;
    const length=Math.min(edgeX,edgeY);
    beamTraces.push({x,y,endX:x+dx*length,endY:y+dy*length,time:.105});
    for(const enemy of enemies) {
      const along=(enemy.x-x)*dx+(enemy.y-y)*dy;
      const cross=Math.abs((enemy.x-x)*dy-(enemy.y-y)*dx);
      if(enemy.hp>0&&along>0&&along<=length&&(enemy===target||cross<(enemy.boss?49:enemy.drone?10:15)))hits.push(enemy);
    }
  }
  for(const enemy of hits) {
    if(enemy.hp>0)hitEnemy(enemy,{damage});
    if(mode!=='fight')break;
  }
}
function fire() {
  const attack=ship.attack+boosts[0]*2;
  // One crit roll per volley, with bounded streaks at the stated long-run rate.
  player.criticalCharge+=.05+boosts[1]*.1;
  const critical=player.criticalCharge>=1;
  if(critical)player.criticalCharge-=1;
  const multiplier=critical?1.5+boosts[2]*.25:1;
  function bullet(offset,vx,weight) {
    bullets.push({x:player.x+offset,y:player.y-ship.nose*craftScale,vx,vy:-545,
      damage:attack*weight*multiplier,straight:vx===0,pierce:boosts[6],bounces:0,hit:new Set()});
  }
  bullet(0,0,1);
  for(let i=1;i<=boosts[3];i++) {
    const side=i%2===1?-1:1;
    bullet(side*Math.ceil(i/2)*13,0,.15);
  }
  for(let i=1;i<=boosts[4];i++) {
    bullet(-8,-100*i,.09);bullet(8,100*i,.09);
  }
  if(boosts[5])fireWingLasers(attack/10);
}
function hitPlayer() {
  if(player.inv>0)return;
  player.inv=1.1;
  player.hp--;
  if(player.hp<=0)overlay('dead','<h2>기체가 격추됐어요</h2><p>같은 기체로 다시 도전할 곳을 골라요.</p><div class="choices"><button data-action="retry-first">1스테이지부터 다시 시작</button><button data-action="retry-current">현재 스테이지 처음부터 다시 시작</button></div>');
}
function enemyBullet(x,y,vx,vy,r,pattern=null) {
  hazards.push({x,y,vx,vy,r,pattern});
}
function spread(x,y,count,center,spacing,speed,r,pattern=null) {
  for(let i=0;i<count;i++) {
    const angle=center+(i-(count-1)/2)*spacing;
    enemyBullet(x,y,Math.sin(angle)*speed,Math.cos(angle)*speed,r,pattern);
  }
}
function aimAtPlayer(x,y) {
  return Math.atan2(player.x-x,player.y-y);
}
function aimedOrigin(enemy,offset=0) {
  const aim=aimAtPlayer(enemy.x+offset,enemy.y);
  const distance=enemy.boss?46:enemy.item?15:10;
  return {x:enemy.x+offset+Math.sin(aim)*distance,y:enemy.y+Math.cos(aim)*distance,aim};
}
function nextBossPattern(e) {
  if(!e.attackBag.length) {
    e.attackBag=shuffle([0,1,2,3,4]);
    if(e.attackBag[0]===e.pattern) e.attackBag.push(e.attackBag.shift());
  }
  e.pattern=e.attackBag.shift();
}
function updateBossAttack(e,dt) {
  if(!e.entered)return;
  if(e.followup&&(e.followup.time-=dt)<=0) {
    for(const side of [-1,1])spread(e.followup.x+side*6,e.followup.y,7,e.followup.aim+side*.54,.115,184,7,1);
    e.followup=null;
  }
  if(stage.number===3&&e.flightTime%10>=7.1)return;
  if(e.pattern===null)nextBossPattern(e);
  e.attackClock-=dt;
  if(e.attackClock>0)return;
  const {x,y,aim}=aimedOrigin(e);
  const alternating=stage.number===6?(e.port===1?-1:1):0;
  e.port=alternating;
  switch(e.pattern) {
    case 0:
      const port=aimedOrigin(e,alternating*27);
      for(const offset of [-20,0,20])enemyBullet(port.x+Math.cos(port.aim)*offset,port.y-Math.sin(port.aim)*offset,
        Math.sin(port.aim)*215,Math.cos(port.aim)*215,7,0);
      break;
    case 1:
      if(stage.number===5) {
        for(let i=0;i<18;i++) {
          if(i<=1||i===17)continue;
          const angle=aim+i*Math.PI/9;
          enemyBullet(e.x+Math.sin(angle)*60,e.y+Math.cos(angle)*60,Math.sin(angle)*178,Math.cos(angle)*178,7,1);
        }
      } else if(stage.number===8) {
        for(const side of [-1,1])spread(x+side*6,y,7,aim+side*.54,.115,184,7,1);
        e.followup={time:.48,x,y,aim};
      } else if(stage.number===6) {
        for(const side of [-1,1]) {
          const port=aimedOrigin(e,side*27);
          spread(port.x,port.y,7,port.aim+side*.34,.095,175,7,1);
        }
      } else spread(x,y,13,aim,.125,175,7,1);
      break;
    case 2: {
      const port=aimedOrigin(e,stage.number===6?-26:0);
      bossLaser={x:port.x,y:port.y,dx:Math.sin(port.aim),dy:Math.cos(port.aim),warning:.8,remaining:.46,width:19};
      break;
    }
    case 3:
      for(const side of [-1,0,1]) {
        const angle=aim+side*.39;
        hazards.push({x:x+Math.cos(aim)*side*31,y:y-Math.sin(aim)*side*31,
          vx:Math.sin(angle)*132,vy:Math.cos(angle)*132,r:7,pattern:3,missile:true,steering:1.35});
      }
      break;
    case 4:
      for(const side of [-1,0,1]) {
        const angle=aim+side*.36;
        enemies.push({x:x+Math.cos(aim)*side*32,y:y-Math.sin(aim)*side*32,
          vx:Math.sin(angle)*160,vy:Math.cos(angle)*160,angle:-angle,
          drone:true,hp:25,max:25,age:0});
      }
      break;
  }
  e.attackClock=e.pattern===2?2.45:1.55;
  nextBossPattern(e);
}
function updateBossLaser(dt) {
  if(!bossLaser)return;
  if(bossLaser.warning>0) {
    bossLaser.warning-=dt;
    return;
  }
  bossLaser.remaining-=dt;
  if(bossLaser.remaining<=0) {bossLaser=null;return;}
  const {x,y,dx,dy,width}=bossLaser;
  const offsetX=player.x-x,offsetY=player.y-y;
  if(offsetX*dx+offsetY*dy>=0&&Math.abs(offsetX*dy-offsetY*dx)<width+7)hitPlayer();
}
function updateEnemyAttack(e,dt) {
  if(e.boss) {updateBossAttack(e,dt);updateReinforcements(e,dt);return;}
  if(e.item)updateReinforcements(e,dt);
  if(e.y<45||(!e.item&&e.fired))return;
  e.shot-=dt;
  if(e.shot>0)return;
  const {x,y,aim}=aimedOrigin(e);
  const count=e.tier+(e.item?2:1);
  spread(x,y,count,aim+(count%2===0?.10:0),.20,e.item?147:107,5);
  e.fired=true;
  e.shot=2.5;
}
function tickEffects(dt) {
  for(const effect of hitEffects)effect.t-=dt;
  hitEffects=hitEffects.filter(effect=>effect.t>0);
}
function hitEnemy(enemy,bullet) {
  enemy.hp-=bullet.damage;
  if(enemy.hp>0)return;
  if(enemy.item) {
    supplyBurst={x:enemy.x,y:enemy.y,time:0};
    for(const escort of enemies)if(escort.reinforcement)escort.hp=0;
    hazards=[];bullets=[];beamTraces=[];
    overlay('supplyBurst');
    return;
  }
  hitEffects.push({x:enemy.x,y:enemy.y,t:.26,size:enemy.boss?85:28});
  if(enemy.boss) {
    bossBurst={x:enemy.x,y:enemy.y,time:0};
    hazards=[];bossLaser=null;bullets=[];enemies=[];beamTraces=[];
    overlay('bossBurst');
  }
}
function flyEnemy(e,dt) {
  e.flightTime+=dt;
  const oldX=e.x;
  const t=e.flightTime;
  const side=e.slot%2===0?-1:1;
  const toward=clamp(t/1.8,0,1);
  const ease=toward*toward*(3-2*toward);
  const spread=clamp((e.y-120)/210,0,1);
  const band=e.slot%3;
  const center=W/2;
  switch(stage.number) {
    case 2:e.x=e.baseX+side*42*Math.sin(t*1.5);break;
    case 3:e.x=center+side*(103-37*t)+(band-1)*23;break;
    case 4:e.x=center+side*(220-440*ease)+(band-1)*16;break;
    case 5:e.x=center+side*(21+spread*129)+(band-1)*15;break;
    case 6:e.x=center+side*(87+125*(1-ease)+31*Math.sin(4.1*t))+(band-1)*14;break;
    case 7:e.x=center+side*(230-162*ease)+(band-1)*13;break;
    case 8:e.x=band===0?center:center+(band===1?-1:1)*(223-143*ease);break;
  }
  e.angle=e.flightTime>.06?clamp(-(e.x-oldX)/dt/245,-.48,.48):0;
  e.y+=(stage.number===2?82:117)*dt;
  if(e.y>H+44) {
    if(e.reinforcement){e.hp=0;return;}
    e.y=[4,6,7].includes(stage.number)?36:-48;e.flightTime=0;e.fired=false;e.shot=1.10;
  }
}
function flyBoss(e,dt) {
  if(!e.entered) {
    e.y=Math.min(158,e.y+164*dt);
    if(e.y===158)e.entered=true;
    return;
  }
  if(bossLaser)return;
  e.flightTime+=dt;
  const t=e.flightTime;
  e.x=240+(stage.number===7?0:stage.number===8?85:132)*Math.sin(t*.93);
  if(stage.number===7)e.y=158-40*Math.sin(t*1.5);
  if(stage.number===3) {
    const cycle=t%10;
    if(cycle>=7.1) e.x=240;
    if(cycle>=7.8&&cycle<8.45)e.y=158+235*Math.sin((cycle-7.8)/.65*Math.PI/2);
    else if(cycle>=8.45)e.y=158+235*Math.max(0,1-(cycle-8.45)/1.55);
  }
}
function update(dt) {
  if(mode==='bossBurst') {
    bossBurst.time+=dt;
    if(bossBurst.time>=bossBurstDuration) {
      bossBurst=null;clearTime=0;overlay('clearFlight');
    }
    return;
  }
  if(mode==='supplyBurst') {
    supplyBurst.time+=dt;
    if(supplyBurst.time>=supplyBurstDuration) {
      supplyBurst=null;
      quiz();
    }
    return;
  }
  if(mode==='clearFlight') {
    clearTime+=dt;player.y-=dt*530;
    player.bank*=Math.exp(-dt*12);
    tickEffects(dt);
    if(clearTime>1.28) {
      if(stage.number===stages.length)cinematic('ending','assets/video/ending-'+ship.asset+'.mp4',finishGame);
      else start(ships.indexOf(ship),stage.number);
    }
    return;
  }
  if(mode==='ready') {
    preparation-=dt;
    if(preparation<=0)overlay('fight');
    return;
  }
  if(mode!=='fight')return;
  elapsed+=dt;scroll=(scroll+dt*37)%(H*2);
  player.inv=Math.max(0,player.inv-dt);
  const dx=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
  const dy=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
  const distance=ship.speed*dt/(dx&&dy?Math.SQRT2:1);
  player.x=clamp(player.x+dx*distance,22,W-22);
  player.y=clamp(player.y+dy*distance,ship.nose*craftScale,H-18);
  updateBank(dt);
  beamTraces=beamTraces.filter(beam=>(beam.time-=dt)>0);
  cooldown-=dt;spawnDelay-=dt;
  if(remaining&&spawnDelay<=0&&enemies.length<6) {spawn();spawnDelay=wave%2===0?.36:.7;}
  for(const e of [...enemies]) {
    e.age+=dt;
    if(e.boss) {
      flyBoss(e,dt);
    } else if(e.drone) {
      e.x+=e.vx*dt;e.y+=e.vy*dt;
      if(e.y>H+25||e.y<-25||e.x<-25||e.x>W+25)e.hp=0;
      continue;
    } else if(e.item) {
      e.y=Math.min(194,e.y+(stage.number===2?88:126)*dt);
    } else {
      flyEnemy(e,dt);
    }
    if(e.hp>0)updateEnemyAttack(e,dt);
  }
  if(cooldown<=0) {fire();cooldown+=shotInterval;}
  if(mode!=='fight') {
    enemies=enemies.filter(e=>e.hp>0);
    return;
  }
  for(const b of bullets) {
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.y<3&&b.straight&&boosts[wallCard]&&!b.bounces) {
      const angle=(18+Math.random()*50)*Math.PI/180;
      const speed=Math.hypot(b.vx,b.vy);
      const sign=Math.random()<.5?-1:1;
      b.y=3;b.vx=sign*Math.sin(angle)*speed;b.vy=Math.cos(angle)*speed;
      b.bounces=1;b.damage*=.65;
    }
    if(b.x<3||b.x>W-3) {
      if(boosts[wallCard]&&!b.bounces&&!b.straight) {
        const side=b.x<3?1:-1;
        const speed=Math.hypot(b.vx,b.vy);
        const angle=(18+Math.random()*50)*Math.PI/180;
        b.x=side===1?3:W-3;
        b.vx=side*Math.sin(angle)*speed;
        b.vy=-Math.cos(angle)*speed;
        b.bounces=1;
        b.damage*=.65;
      } else b.used=true;
    }
    if(b.used)continue;
    for(const e of enemies) {
      if(e.hp<=0||b.hit.has(e)||Math.abs(b.x-e.x)>(e.boss?73:e.drone?12:19)||Math.abs(b.y-e.y)>(e.boss?48:e.drone?12:21)) continue;
      b.hit.add(e);
      if(b.pierce--<=0)b.used=true;
      hitEnemy(e,b);
      if(mode!=='fight'||b.used)break;
    }
    if(mode!=='fight')break;
  }
  enemies=enemies.filter(e=>e.hp>0);
  bullets=bullets.filter(b=>!b.used&&b.y>-25&&b.y<H+25);
  if(mode!=='fight')return;
  updateBossLaser(dt);
  if(mode!=='fight')return;
  for(const b of hazards) {
    if(b.missile&&b.steering>0) {
      const angle=Math.atan2(b.vx,b.vy),target=aimAtPlayer(b.x,b.y);
      const delta=Math.atan2(Math.sin(target-angle),Math.cos(target-angle));
      const heading=angle+clamp(delta,-.62*dt,.62*dt);
      b.vx=Math.sin(heading)*132;b.vy=Math.cos(heading)*132;
      b.steering-=dt;
    }
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(Math.hypot(b.x-player.x,b.y-player.y)<b.r+9) {b.used=true;hitPlayer();}
  }
  hazards=hazards.filter(b=>!b.used&&b.y<H+20&&b.y>-20&&b.x>-20&&b.x<W+20);
  for(const e of enemies) {
    const dx=(e.x-player.x)/(e.boss?81:e.item?29:e.drone?15:24);
    const dy=(e.y-player.y)/(e.boss?53:e.drone?14:25);
    if(dx*dx+dy*dy<1) {
      if(e.drone)e.hp=0;
      hitPlayer();
      if(mode!=='fight')break;
    }
  }
  tickEffects(dt);
  if(!remaining&&!enemies.length&&wave%2===0&&mode==='fight')nextWave();
}
const playerOutline=[[94,0],[105,4],[109,13],[126,18],[143,31],[166,47],[184,59],[193,70],[191,78],[181,84],[115,88],[111,99],[132,108],[136,116],[130,122],[112,126],[113,137],[102,140],[82,140],[76,130],[65,127],[54,119],[54,111],[61,105],[77,98],[74,88],[14,83],[4,77],[0,69],[8,59],[30,47],[52,30],[68,19],[81,14],[87,4]];
const bossOutline=[[250,0],[302,0],[325,18],[325,42],[351,46],[351,16],[368,16],[374,59],[409,65],[425,89],[493,93],[542,105],[569,124],[580,145],[574,161],[543,171],[516,169],[518,232],[507,267],[481,285],[436,288],[410,278],[396,313],[372,335],[330,351],[299,361],[255,350],[216,331],[186,304],[174,277],[147,290],[100,288],[73,269],[60,240],[58,178],[27,173],[8,162],[0,146],[15,119],[44,106],[95,97],[146,92],[157,70],[187,63],[200,20],[212,16],[221,27],[222,47],[251,43],[240,29],[241,14]];
function sprite(outline,sx,sy,sw,sh,x,y,width,height,flip=false,tint=null) {
  ctx.save();ctx.translate(x,y);if(flip)ctx.rotate(Math.PI);
  ctx.scale(width/sw,height/sh);ctx.translate(-sw/2,-sh/2);
  ctx.beginPath();outline.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();
  if(concept.naturalWidth) {
    ctx.clip();ctx.drawImage(concept,-sx,-sy);
    if(tint) {ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.30;ctx.fillStyle=tint;ctx.fillRect(0,0,sw,sh);}
  } else {ctx.fillStyle=tint||'#cc8734';ctx.fill();}
  ctx.restore();
}
function terrain() {
  const background=stage.art?.background||jungle;
  if(!background.naturalWidth)return;
  const offset=(scroll||0)%(H*2);
  for(let i=-2;i<=0;i++){
    const top=offset+i*H;
    ctx.save();
    if(i%2) {ctx.translate(0,top+H);ctx.scale(1,-1);ctx.drawImage(background,0,0,W,H);}
    else ctx.drawImage(background,0,top,W,H);
    ctx.restore();
  }
  ctx.fillStyle='#00182724';ctx.fillRect(0,0,W,H);
  if(stage.number>1)return;
  const layer=Math.sin((scroll||0)/95)*38;
  for(const [x,y] of [[17,128],[466,304],[12,546]]) {
    const fog=ctx.createRadialGradient(x,y+layer,0,x,y+layer,69);
    fog.addColorStop(0,'#e9ffff59');fog.addColorStop(1,'#e9ffff00');
    ctx.fillStyle=fog;ctx.fillRect(x-70,y+layer-70,140,140);
  }
}
function drawStageImage(image,x,y,width,maxHeight,angle=0) {
  if(!image?.naturalWidth)return false;
  const ratio=Math.min(width/image.naturalWidth,maxHeight/image.naturalHeight);
  const w=image.naturalWidth*ratio,h=image.naturalHeight*ratio;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();
  return true;
}
function drawEnemy(e) {
  if(e.boss) {
    if(!drawStageImage(stage.art?.boss,e.x,e.y,stage.number===8?212:enemySize.boss,135))sprite(bossOutline,222,174,580,363,e.x,e.y,enemySize.boss,116);
    ctx.fillStyle='#102831';ctx.fillRect(e.x-66,e.y-70,132,10);
    ctx.fillStyle='#ff9b4f';ctx.fillRect(e.x-64,e.y-68,128*e.hp/e.max,6);
    ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillStyle='white';ctx.fillText(stage.boss,e.x,e.y-76);
    if(stage.number===8&&e.pattern===1&&e.attackClock>.03&&e.attackClock<.75) {
      ctx.beginPath();ctx.ellipse(e.x,e.y+53,65,27,0,.12,Math.PI-.12);
      ctx.strokeStyle='#ffce7b';ctx.lineWidth=3;ctx.stroke();
    }
    if(e.entered&&e.pattern!==null&&e.attackClock>.26) {
      const name=bossPatterns[e.pattern];
      ctx.fillStyle='#172735ee';ctx.fillRect(e.x-48,e.y+62,96,22);
      ctx.fillStyle='#ffdb86';ctx.fillText(name,e.x,e.y+78);
    }
  } else {
    const size=e.item?enemySize.item:e.drone?enemySize.drone:enemySize.normal;
    if(!drawStageImage(e.item?stage.art?.supply:stage.art?.normal,e.x,e.y,size,size,e.angle||0))sprite(playerOutline,416,1131,193,140,e.x,e.y,size,size*.73,true,e.item?'#ffd43b':e.drone?'#ed7540':'#fb5e76');
    ctx.fillStyle='#281d29';ctx.fillRect(e.x-size/2,e.y-size*.47,size,4);
    ctx.fillStyle=e.item?'#ffd95f':'#fe937f';ctx.fillRect(e.x-size/2,e.y-size*.47,size*e.hp/e.max,4);
    if(e.item) {
      ctx.save();ctx.translate(e.x,e.y);
      ctx.strokeStyle='#ffd443';ctx.lineWidth=2+(Math.sin(e.age*9)+1);
      ctx.strokeRect(-31,-31,62,62);
      if(stage.art?.supply?.naturalWidth){ctx.restore();return;}
      ctx.fillStyle='#714318';ctx.fillRect(-10,-9,20,16);
      ctx.strokeStyle='#ffdf78';ctx.strokeRect(-10,-9,20,16);
      ctx.beginPath();ctx.moveTo(-10,-3);ctx.lineTo(10,-3);ctx.moveTo(0,-9);ctx.lineTo(0,7);ctx.stroke();
      ctx.restore();
    }
  }
}
function drawSupplyBurst({x,y,time}) {
  const progress=time/supplyBurstDuration;
  ctx.save();
  ctx.translate(x,y);
  if(progress<.32) {
    ctx.save();
    ctx.rotate(progress*1.3);
    ctx.globalAlpha=1-progress/.32;
    if(!drawStageImage(stage.art?.supply,0,progress*24,55,55))sprite(playerOutline,416,1131,193,140,0,progress*24,55,40,true,'#ffd43b');
    ctx.restore();
  }
  const glow=ctx.createRadialGradient(0,0,0,0,0,29+57*progress);
  glow.addColorStop(0,'#fff2b5');
  glow.addColorStop(.4,'#ff901a');
  glow.addColorStop(1,'#ff4c0000');
  ctx.globalAlpha=(1-progress)*.85;
  ctx.fillStyle=glow;ctx.fillRect(-90,-90,180,180);
  ctx.strokeStyle='#ffdb81';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(0,0,8+progress*64,0,Math.PI*2);ctx.stroke();
  for(let i=0;i<11;i++) {
    const angle=i*Math.PI*2/11;
    ctx.save();ctx.rotate(angle);
    ctx.fillStyle=i%2?'#fff2ad':'#ff9a53';
    ctx.fillRect(8+progress*(59+i%3*17),-2,4+(1-progress)*11,4);
    ctx.restore();
  }
  ctx.restore();
}
function updateBank(dt) {
  if(dt<=0)return;
  const lateralSpeed=(player.x-player.bankX)/dt;
  const target=clamp(lateralSpeed/(ship.speed*.72),-1,1)*ship.bank;
  player.bank+=(target-player.bank)*(1-Math.exp(-dt*13));
  player.bankX=player.x;
}
function drawPlayerShip(context,x,y,model,bank,scale=1) {
  const {image}=model;
  if(!image.naturalWidth)return;
  const size=Math.min(60/image.naturalWidth,47/image.naturalHeight)*scale;
  const width=image.naturalWidth*size;
  const height=image.naturalHeight*size;
  context.save();
  context.translate(x,y);
  context.rotate(bank*.18);
  context.transform(1-Math.abs(bank)*.16,bank*.12,0,1,0,0);
  context.drawImage(image,-width/2,-height/2,width,height);
  context.restore();
}
function drawBossLaser(laser) {
  const active=laser.warning<=0;
  ctx.save();
  ctx.strokeStyle=active?'#f75465cc':'#ffdb89b0';
  ctx.lineWidth=active?laser.width*2:3;
  if(!active)ctx.setLineDash([7,8]);
  ctx.beginPath();ctx.moveTo(laser.x,laser.y);ctx.lineTo(laser.x+laser.dx*1000,laser.y+laser.dy*1000);ctx.stroke();
  if(active) {
    ctx.strokeStyle='#fff4d6';ctx.lineWidth=7;ctx.stroke();
  }
  ctx.restore();
}
function drawBossBurst({x,y,time}) {
  ctx.save();
  for(const [offsetX,offsetY,delay,radius] of [[0,0,0,110],[-56,-4,.18,64],[54,8,.31,70],[0,12,.57,139]]) {
    const t=(time-delay)/.80;
    if(t<0||t>=1)continue;
    const r=12+radius*t;
    const glow=ctx.createRadialGradient(x+offsetX,y+offsetY,0,x+offsetX,y+offsetY,r);
    glow.addColorStop(0,'#fff7ce');glow.addColorStop(.36,'#fff17f');
    glow.addColorStop(.67,'#ff731d');glow.addColorStop(1,'#ff331100');
    ctx.globalAlpha=(1-t)*.95;
    ctx.fillStyle=glow;ctx.fillRect(x+offsetX-r,y+offsetY-r,r*2,r*2);
    ctx.strokeStyle='#ffdb9a';ctx.lineWidth=4*(1-t)+1;
    ctx.beginPath();ctx.arc(x+offsetX,y+offsetY,r*.7,0,Math.PI*2);ctx.stroke();
  }
  for(let i=0;i<28;i++) {
    const a=i*Math.PI*2/28;
    const r=time*(90+i%7*27);
    ctx.globalAlpha=Math.max(0,1-time/bossBurstDuration);
    ctx.fillStyle=i%3===0?'#fff4bb':'#ff8a42';
    ctx.save();ctx.translate(x+Math.cos(a)*r,y+Math.sin(a)*r);ctx.rotate(a);
    ctx.fillRect(-4,-2,8+i%4*3,3);ctx.restore();
  }
  ctx.restore();
}
function draw() {
  ctx.clearRect(0,0,W,H);terrain();
  if(!player||['menu','title','intro','ending','finished'].includes(mode))return;
  for(const e of enemies)drawEnemy(e);
  ctx.save();
  for(const beam of beamTraces) {
    ctx.beginPath();ctx.moveTo(beam.x,beam.y);ctx.lineTo(beam.endX,beam.endY);
    ctx.strokeStyle='#39d7aa75';ctx.lineWidth=6;ctx.stroke();
    ctx.strokeStyle='#c7fff1';ctx.lineWidth=2;ctx.stroke();
  }
  if(stage.number===3) {
    const boss=enemies.find(e=>e.boss&&e.entered&&e.flightTime%10>=7.1&&e.flightTime%10<7.8);
    if(boss) {
      ctx.setLineDash([7,8]);ctx.beginPath();ctx.moveTo(boss.x,boss.y+55);ctx.lineTo(boss.x,H);
      ctx.strokeStyle='#ffc879';ctx.lineWidth=3;ctx.stroke();
    }
  }
  ctx.restore();
  for(const b of bullets) {
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vx,-b.vy));
    ctx.fillStyle='#07375b';ctx.fillRect(-4,-9,8,18);
    ctx.fillStyle=b.bounces?'#ffe993':'#8cf6ff';ctx.fillRect(-2,-7,4,14);ctx.restore();
  }
  if(bossLaser)drawBossLaser(bossLaser);
  for(const b of hazards) {
    if(b.missile) {
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(-Math.atan2(b.vx,b.vy));
      ctx.fillStyle='#f4b85d';ctx.fillRect(-3,-12,6,11);
      ctx.fillStyle='#eb6370';ctx.fillRect(-4,-3,8,13);
      ctx.fillStyle='#fff3ba';ctx.fillRect(-2,5,4,5);ctx.restore();
      continue;
    }
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,2*Math.PI);
    ctx.fillStyle='#68172a';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#340f24';ctx.stroke();
    ctx.beginPath();ctx.arc(b.x,b.y,b.r-2,0,2*Math.PI);ctx.strokeStyle=b.pattern===null?'#ff8a77':(['#ff7b73','#ffae54','#ff9bbc','#ffcf79','#ff867d'][b.pattern]||'#ff8a77');ctx.stroke();
  }
  for(const effect of hitEffects) {
    ctx.beginPath();ctx.arc(effect.x,effect.y,effect.size*(1-effect.t/.32),0,2*Math.PI);
    ctx.strokeStyle='#ffd675'+Math.round(effect.t/.26*255).toString(16).padStart(2,'0');ctx.lineWidth=4;ctx.stroke();
  }
  if(supplyBurst)drawSupplyBurst(supplyBurst);
  if(bossBurst)drawBossBurst(bossBurst);
  if(mode!=='dead' && (player.inv<=0||Math.floor(player.inv*14)%2===0)) {
    drawPlayerShip(ctx,player.x,player.y,ship,player.bank,craftScale);
  }
  if(mode==='ready') {
    ctx.textAlign='center';ctx.font='bold 31px system-ui';ctx.fillStyle='#09232e';ctx.fillRect(151,327,178,52);
    ctx.fillStyle='#fff';ctx.fillText('전투 준비!',240,362);
    ctx.font='bold 15px system-ui';ctx.fillText(stage.topic,240,385);
  }
  if(mode==='clearFlight') {
    ctx.textAlign='center';ctx.font='bold 49px system-ui';ctx.strokeStyle='#152a37';ctx.lineWidth=8;
    ctx.strokeText('STAGE CLEAR',240,350);ctx.fillStyle='#ffe281';ctx.fillText('STAGE CLEAR',240,350);
  }
}
function frame(now) {
  update(Math.max(0,Math.min((now-last)/1000,.032)));
  last=now;draw();
  if(player&&!status.hidden) {
    const label=stage.number+' '+stage.name+' · '+ship.name+'<br>체력 '+player.hp+'/'+ship.hp+' · 구간 '+(wave+1)+'/'+waves.length+
      '<progress class="player-health '+(player.hp/ship.hp<=.34?'low':'')+'" aria-label="기체 잔여 체력" value="'+player.hp+'" max="'+ship.hp+'"></progress>';
    if(status.innerHTML!==label)status.innerHTML=label;
  } else if(status.innerHTML!=='1 정글 상공')status.innerHTML='1 정글 상공';
  requestAnimationFrame(frame);
}
overlay('intro-ready','<h1>분수 에이스</h1><div class="choices"><button data-action="intro">인트로 보기</button><button data-action="title">건너뛰기</button></div>');
status.hidden=true;
requestAnimationFrame(frame);
