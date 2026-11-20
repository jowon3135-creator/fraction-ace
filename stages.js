'use strict';

const stages = [
  ['정글 상공','정찰 모함','부분을 분수로 나타내기'],
  ['바다 상공','가오리형 비행체','개수와 분수'],
  ['협곡 상공','쌍날개 비행체','길이·시간과 분수'],
  ['북극 상공','얼음 장갑 비행체','진분수와 가분수'],
  ['화산섬 상공','원형 화산 비행체','대분수 알아보기'],
  ['구름 위 공중 도시','쌍동체 비행체','분모가 같은 분수 비교'],
  ['오로라 밤하늘','초승달 비행체','대분수끼리 비교'],
  ['행성 궤도','외계인 모함','가분수와 대분수 비교']
].map(([name,boss,topic],index)=>({name,boss,topic,number:index+1}));

function gameImage(path) {
  const image = new Image();
  image.src = path;
  return image;
}
function loadStageArt(stage) {
  if(stage.art || stage.number===1)return;
  const dir='assets/stages/'+stage.number+'/';
  stage.art={
    background:gameImage(dir+'background.jpg'),
    normal:gameImage(dir+'normal.png'),
    supply:gameImage(dir+'supply.png'),
    boss:gameImage(dir+'boss.png')
  };
}
function fraction(n,d) {
  return '<span class="fraction" aria-label="'+d+'분의 '+n+'"><b>'+n+'</b><b>'+d+'</b></span>';
}
function mixed(whole,n,d) {
  return whole+'&nbsp;'+fraction(n,d);
}
function parts(n,d) {
  return '<div class="parts" role="img" aria-label="같은 크기 '+d+'칸 중 줄무늬 '+n+'칸">'+
    Array.from({length:d},(_,i)=>'<span class="'+(i<n?'mark':'')+'"></span>').join('')+'</div>';
}
function question(prompt,choices,hint,group='',diagram='') {
  return {prompt,choices:choices.map((html,index)=>({html,correct:index===0})),hint,group,diagram};
}
function compare(left,right,relation,hint) {
  const symbols=['&lt;','=','&gt;'];
  return question('□에 들어갈 기호를 고르세요.<br><span class="comparison">'+left+' &nbsp;□&nbsp; '+right+'</span>',
    [symbols[relation],...symbols.filter((_,i)=>i!==relation)],hint,['less','equal','greater'][relation]);
}
function compareValues(a,b) {return a===b?1:a<b?0:2;}
const sameDenominatorHint='분모가 같아요. 분자의 크기를 비교해 보세요.';
const partsBank = [[1,2],[1,3],[2,3],[1,4],[2,4],[3,4],[2,5],[3,5],[3,6],[5,6],[3,8],[5,8]];
const quantityBank = [[8,1,2],[12,1,3],[12,2,3],[16,3,4],[20,2,5],[18,5,6]];
const comparisonBank = [[2,3,4],[3,1,5],[4,4,6],[6,5,4],[6,8,5],[7,7,6],[2,5,8],[5,3,6],[3,3,5],[8,10,7],[9,6,5],[5,5,4]];

function quantityQuestions(units) {
  return quantityBank.flatMap(([total,n,d],i)=>{
    const unit=units[i%units.length], count=total/d*n;
    const objects=unit==='개'?'별 스티커':'전체 길이';
    const whole=unit==='분'?'전체 시간':objects;
    return [
      question(whole+' '+total+unit+' 중 '+count+unit+'는 전체의 얼마인가요?',
        [fraction(n,d),fraction(d,n),fraction(n===1?2:n-1,d)],'전체를 '+d+'묶음으로 똑같이 나누면 '+count+unit+'는 그중 '+n+'묶음이에요.','fraction'),
      question(whole+' '+total+unit+'의 '+fraction(n,d)+'는 얼마인가요?',
        [count+unit,(count+total/d)+unit,(count===1?count+2:count-1)+unit],'전체를 '+d+'로 나눈 뒤 '+n+'을 곱해 보세요.','amount')
    ];
  });
}
function buildQuestions(stageNumber) {
  switch(stageNumber) {
    case 1:
      return partsBank.map(([n,d])=>question('색과 줄무늬가 있는 부분은 전체의 얼마인가요?',
        [fraction(n,d),fraction(d,n),d===2?fraction(1,3):fraction(n===1?2:n-1,d)],
        '전체 칸 수를 분모에, 줄무늬 칸 수를 분자에 써요.','',parts(n,d)));
    case 2: return quantityQuestions(['개']);
    case 3: return quantityQuestions(['m','분','cm','분']);
    case 4:
      return partsBank.map(([n,d],i)=>{
        const top=i%2===0?n:d+Math.floor(i/2);
        const proper=top<d;
        return question(fraction(top,d)+'는 어떤 분수인가요?',
          proper?['진분수','가분수']:['가분수','진분수'],'분자가 분모보다 작으면 진분수, 분자와 분모가 같거나 분자가 더 크면 가분수예요.');
      });
    case 5:
      return partsBank.map(([n,d],i)=>{
        const whole=i%3+1;
        const picture='<div class="whole-parts">'+Array.from({length:whole},()=>parts(d,d)).join('')+parts(n,d)+'</div>';
        return question('색칠한 양을 대분수로 나타내세요.',
          [mixed(whole,n,d),mixed(whole+1,n,d),d===2?mixed(whole,1,3):mixed(whole,n===1?2:n-1,d)],
          '모두 색칠한 막대 '+whole+'개와, '+d+'칸 중 '+n+'칸을 합쳐 보세요.','',picture);
      });
    case 6:
      return comparisonBank.map(([a,b,d])=>compare(fraction(a,d),fraction(b,d),compareValues(a,b),sameDenominatorHint));
    case 7:
      return comparisonBank.map(([a,b,d],i)=>{
        const n=a%(d-1)+1,m=b%(d-1)+1, left=i%3+1, right=i%4===0?left+1:left;
        return compare(mixed(left,n,d),mixed(right,m,d),compareValues(left*d+n,right*d+m),
          '자연수 부분을 먼저 비교해요. 같으면 분수 부분의 분자를 비교해요.');
      });
    case 8:
      return comparisonBank.map(([a,b,d],i)=>{
        const whole=i%3+1,n=b%(d-1)+1, mixedTop=whole*d+n;
        const improper=mixedTop+(i%3===0?0:i%3===1?1:-1);
        const left=fraction(improper,d),right=mixed(whole,n,d);
        const order=compareValues(improper,mixedTop);
        const hint='대분수를 가분수로 바꾸면 '+whole+'×'+d+'+'+n+'가 분자예요.';
        return i%2===0?compare(left,right,order,hint):compare(right,left,2-order,hint);
      });
  }
}
function selectQuestions(stageNumber,count) {
  const pool=shuffle(buildQuestions(stageNumber));
  if(stageNumber===2||stageNumber===3) {
    const first=Math.random()<.5?Math.floor(count/2):Math.ceil(count/2);
    return shuffle([...pool.filter(q=>q.group==='fraction').slice(0,first),...pool.filter(q=>q.group==='amount').slice(0,count-first)]);
  }
  if(stageNumber===8) {
    const selected=['less','equal','greater'].map(group=>pool.find(q=>q.group===group));
    return shuffle([...selected,...pool.filter(q=>!selected.includes(q)).slice(0,count-selected.length)]);
  }
  return pool.slice(0,count);
}
