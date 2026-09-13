const yes=document.getElementById('yes'),no=document.getElementById('no');
const canvas=document.getElementById('hearts'),ctx=canvas.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let count=0,accepted=false,particles=[],frame=0,timers=[],last=0;
function resize(){const d=Math.min(devicePixelRatio||1,2);canvas.width=innerWidth*d;canvas.height=innerHeight*d;ctx.setTransform(d,0,0,d,0,0);if(!accepted&&count){growYes();placeNo();}}
function placeNo(){
 const pad=16,w=Math.min(120,innerWidth-32),h=60;
 const old=no.getBoundingClientRect();no.classList.add('roaming');
 const yRect=yes.getBoundingClientRect(),title=document.getElementById('question-title').getBoundingClientRect();
 const candidates=[];
 const upper=count%2===1;
 for(let i=0;i<160;i++){
  const x=pad+Math.random()*Math.max(0,innerWidth-w-pad*2);
  const maxY=Math.max(pad,innerHeight-h-pad);
  const y=upper?pad+Math.random()*Math.max(0,Math.min(maxY,innerHeight*.3)-pad):pad+Math.random()*Math.max(0,maxY-pad);
  const overlaps=r=>x<r.right+12&&x+w>r.left-12&&y<r.bottom+12&&y+h>r.top-12;
  if(!overlaps(yRect)&&!overlaps(title))candidates.push({x,y,dist:Math.hypot(x-old.left,y-old.top)});
 }
 candidates.sort((a,b)=>b.dist-a.dist);
 const choice=candidates[Math.floor(Math.random()*Math.min(8,candidates.length))]||{x:old.left>innerWidth/2?pad:innerWidth-w-pad,y:pad};
 no.style.setProperty('--x',choice.x+'px');no.style.setProperty('--y',choice.y+'px');
}
function growYes(){
 const steps=Math.min(count,12);
 const button=yes.getBoundingClientRect();
 const title=document.getElementById('question-title').getBoundingClientRect();
 const centerY=button.top+button.height/2;
 const coverScale=(2*Math.max(0,centerY-title.top)+100)/yes.offsetHeight;
 const targetScale=Math.max(6,coverScale,(innerWidth+80)/yes.offsetWidth);
 const scale=1+(targetScale-1)*steps/12;
 yes.style.transform='scale('+scale+')';
}
no.addEventListener('click',()=>{
 if(accepted)return;count++;
 no.classList.add('roaming');growYes();placeNo();
});
function burst(x,y,amount=65,fade=1){
 const colors=['#ff142e','#d90019','#a80012','#ef233c','#c91022'];
 for(let i=0;i<amount;i++){const a=Math.random()*Math.PI*2,s=2+Math.random()*6;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-2,life:1,decay:(.006+Math.random()*.006)*fade,size:5+Math.random()*9,color:colors[i%colors.length],angle:Math.random()*6,spin:(Math.random()-.5)*.07});}
}
function draw(t){
 const dt=Math.min((t-last)/16.67,2)||1;last=t;ctx.clearRect(0,0,innerWidth,innerHeight);
 particles=particles.filter(p=>p.life>0);
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=.045*dt;p.vx*=.996;p.life-=p.decay*dt;p.angle+=p.spin*dt;ctx.save();ctx.globalAlpha=Math.max(0,p.life);ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.scale(p.size,p.size);ctx.fillStyle=p.color;ctx.beginPath();ctx.moveTo(0,.35);ctx.bezierCurveTo(-1,-.3,-.5,-1,0,-.5);ctx.bezierCurveTo(.5,-1,1,-.3,0,.35);ctx.fill();ctx.restore();}
 if(particles.length)frame=requestAnimationFrame(draw);else frame=0;
}
function accept(){
 if(accepted||document.getElementById('question').hidden)return;accepted=true;document.body.classList.add('accepted');document.getElementById('bouquet').focus({preventScroll:true});
 if(reduced.matches)return;
 burst(innerWidth*.5,innerHeight*.4,20,2);last=performance.now();frame=requestAnimationFrame(draw);
 [250].forEach((delay,i)=>timers.push(setTimeout(()=>burst(innerWidth*(i%2?.75:.25),innerHeight*(.25+Math.random()*.3),15,2),delay)));

}
yes.addEventListener('click',accept);
addEventListener('resize',resize);resize();

if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 try{Promise.resolve(document.modelContext.registerTool({name:'accept_flowers',title:'꽃 받기',description:'Accept the bouquet and show the heart celebration.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object');accept();return {accepted};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
 addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

const ns='http://www.w3.org/2000/svg';
function svgEl(tag,attrs,parent){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(parent)parent.appendChild(el);return el;}
const flowerPositions=[
[145,157,47],[211,152,42],[275,155,43],[346,155,46],
[53,207,47],[117,211,44],[185,205,43],[248,212,48],[316,202,48],[387,215,44],[453,211,48],
[85,263,45],[150,261,43],[215,254,46],[283,263,44],[349,260,43],[417,264,44],
[42,311,49],[111,319,46],[177,309,47],[245,318,44],[311,310,43],[378,321,46],[453,313,48],
[84,363,45],[151,362,45],[217,366,43],[282,363,44],[349,369,46],[418,362,45],
[118,415,49],[185,422,45],[253,420,47],[323,416,49],[392,421,47]
];
const flowers=document.getElementById('flowers');
flowerPositions.forEach(([x,y,r],i)=>{
 const g=svgEl('g',{transform:`translate(${x} ${y}) rotate(${(i*37)%60-30})`},flowers);
 const bloom=svgEl('g',{class:'flower-bloom',style:`--delay:${(i%7)*.07}s`},g);
 const sway=svgEl('g',{class:'flower-sway',style:`--delay:-${i*.17}s`},bloom);
 const gold=false;
 for(let layer=0;layer<3;layer++){
  const radius=r*(1-layer*.28),n=layer===2?5:6;
  for(let j=0;j<n;j++){
   svgEl('path',{d:`M0 4 C${-radius*.7} ${-radius*.3} ${-radius*.4} ${-radius*.89} 0 ${-radius} C${radius*.4} ${-radius*.86} ${radius*.7} ${-radius*.3} 0 4`,transform:`rotate(${j*360/n+layer*28})`,fill:`url(#${gold?'gold':'red'})`,opacity:1-layer*.03},sway);
  }
 }
 svgEl('circle',{r:3.8,fill:gold?'#ffe993':'#ec2540'},sway);
});
document.getElementById('bouquet').addEventListener('click',e=>{
 if(!accepted||reduced.matches)return;
 const r=document.getElementById('bouquet').getBoundingClientRect();
 burst(e.detail?e.clientX:r.left+r.width/2,e.detail?e.clientY:r.top+r.height*.4);
 if(!frame){last=performance.now();frame=requestAnimationFrame(draw);}
});

document.getElementById('name-form').addEventListener('submit',event=>{
 event.preventDefault();
 const input=document.getElementById('recipient-name');
 const name=input.value.trim();
 if(!name){input.setCustomValidity('이름을 입력해주세요.');input.reportValidity();return;}
 input.setCustomValidity('');
 document.getElementById('recipient-greeting').textContent=name+'님 꽃이 도착했습니다.';
 document.getElementById('name-screen').hidden=true;
 document.getElementById('question').hidden=false;
 document.getElementById('question-title').focus({preventScroll:true});
});
document.getElementById('recipient-name').addEventListener('input',event=>event.target.setCustomValidity(''));
