import re
s=open('index.html').read()
css = r'''
  #pframe{position:absolute;z-index:40;border:7px solid #d6b27a;box-shadow:0 26px 60px rgba(70,45,20,.45);background:#e9dccb}
  #sub{position:absolute;z-index:41;background:rgba(40,28,18,.78);color:#fff;font-weight:500;font-size:44px;line-height:1.3;
     padding:22px 32px;border-radius:28px;text-align:center}
  #sub .k{color:#f0d3a0;font-weight:800}
  #s2bottom2,#s3sub,#s4sub2{display:none}
  #s1line,#s1tag{display:none}
'''
s=s.replace('</style>',css+'</style>',1)
# scene 1 layout: titles move to top, presenter card in middle
s=s.replace('id="s1script" style="top:560px;font-size:120px"','id="s1script" style="top:70px;font-size:96px"')
s=s.replace('<div class="center suez" style="top:720px;font-size:170px;line-height:1.05">\n      <span class="word" id="s1w1">חבילת</span>\n    </div>\n    <div class="center suez" style="top:900px;font-size:150px;line-height:1.05;color:var(--brown2)">',
            '<div class="center suez" style="top:190px;font-size:104px;line-height:1.05;color:var(--brown2)">\n      <span class="word" id="s1w1" style="color:var(--brown)">חבילת</span>')
# room for presenter circle (bottom-right) in scenes 2-5
s=s.replace('id="s2bottom" style="top:1580px;','id="s2bottom" style="top:1555px;right:330px;')
s=s.replace('<div class="center suez" style="top:1300px;font-size:140px','<div class="center suez" style="top:1265px;font-size:140px')
s=s.replace('<div class="center" style="top:1530px">\n      <span class="pill" id="s3p1">','<div class="center" style="top:1478px">\n      <span class="pill" id="s3p1">')
s=s.replace('id="s4sub" style="top:1620px;font-size:52px;','id="s4sub" style="top:1600px;right:330px;font-size:44px;')
s=s.replace('id="s5sub" style="top:1540px;','id="s5sub" style="top:1495px;')
s=s.replace('  <div id="flash"></div>','  <div id="pframe"></div>\n  <div id="sub"></div>\n  <div id="flash"></div>',1)
js = r'''
/* ---------- presenter + time warp ---------- */
const OLD=[0,4.2,9.6,15.0,20.8,26.5], NEW=[0,7.4,13.0,19.7,26.7,35.0];
function warp(t){ for(let i=0;i<NEW.length-1;i++){ if(t<=NEW[i+1]){ const k=(t-NEW[i])/(NEW[i+1]-NEW[i]); return OLD[i]+k*(OLD[i+1]-OLD[i]); } } return OLD[OLD.length-1]; }
const CUES=[[0.10,1.60,'היי!'],[1.55,3.33,'מתכננים אירוע?'],[3.33,5.90,'בואו נדאג שהוא יישאר איתכם...'],[5.90,7.43,'לתמיד.'],
 [7.43,13.04,'מגנטים טריים ואיכותיים, <span class="k">ללא הגבלה</span>, לאורך כל האירוע!'],
 [13.04,19.70,'צילומי סטילס מקצועיים: <span class="k">צילומי יום</span> וצילומים <span class="k">ספונטניים</span>'],
 [19.70,23.76,'רוצים להוסיף קיר צילום מעוצב, בהתאמה אישית?'],[23.76,26.69,'יש לנו, <span class="k">במחיר לכל כיס!</span>'],
 [26.69,28.86,'הכל בחבילה אחת.'],[28.86,33.4,'שלחו הודעה, ושריינו את התאריך שלכם <span class="k">עוד היום!</span>']];
const CARD={x:140,y:400,w:800,h:1000,r:44}, PIP={x:750,y:1590,w:300,h:300,r:150};
const ease=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
window.pres=function(t){
  let k = t<6.9?0 : t>7.7?1 : ease((t-6.9)/0.8);
  const L=(a,b)=>a+(b-a)*k;
  const appear = Math.min(1,Math.max(0,(t-0.15)/0.5));
  return {x:L(CARD.x,PIP.x),y:L(CARD.y,PIP.y),w:L(CARD.w,PIP.w),h:L(CARD.h,PIP.h),r:L(CARD.r,PIP.r),zoom:1+k*0.9,fy:0.36,k:k,alpha:appear,
          scale:0.92+0.08*(1-Math.pow(1-appear,3))};
};
const pf=$('#pframe'), sub=$('#sub');
let lastCue='';
function updPresenter(t){
  const p=pres(t), b=7;
  const cx=p.x+p.w/2, cy=p.y+p.h/2, w=p.w*p.scale, h=p.h*p.scale;
  Object.assign(pf.style,{left:(cx-w/2-b)+'px',top:(cy-h/2-b)+'px',width:(w+2*b)+'px',height:(h+2*b)+'px',borderRadius:(p.r*p.scale+b)+'px',opacity:p.alpha});
  let c=null; for(const q of CUES) if(t>=q[0]-0.05 && t<q[1]) c=q;
  if(!c){ sub.style.opacity=0; return; }
  if(c[2]!==lastCue){ sub.innerHTML=c[2]; lastCue=c[2]; }
  const intro = p.k<0.5;
  if(intro){ Object.assign(sub.style,{left:'90px',right:'90px',width:'auto',top:'1470px',fontSize:'50px'}); }
  else { Object.assign(sub.style,{left:'40px',right:'auto',width:'650px',top:'1660px',fontSize:'42px'}); }
  const a=Math.min(1,(t-c[0]+0.05)/0.15); sub.style.opacity=a; sub.style.transform=`translateY(${(1-a)*12}px)`;
}
'''
s=s.replace('window.DURATION = T.end;',js+'window.DURATION = 35.0;',1)
s=s.replace("""window.seek = (t) => {
  tl.seek(t, false);
  updBalloons(b1, t, 1);
  updBalloons(b5, t, .6);""","""window.seek = (t) => {
  tl.seek(warp(t), false);
  updBalloons(b1, t, 1);
  updBalloons(b5, t, .6);
  updPresenter(t);""",1)
assert 'updPresenter(t);' in s and 'top:190px;font-size:104px' in s
open('index_presenter.html','w').write(s)
