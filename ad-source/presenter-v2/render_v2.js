const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
(async()=>{const mode=process.argv[2];const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
 await p.goto('file://'+path.resolve('v2.html')+'?render');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
 if(mode==='preview'){for(const t of [5,19,29,41,48]){await p.evaluate(t=>seek(t),t);await p.screenshot({path:`v2pv_${t}.jpg`,type:'jpeg',quality:70});}}
 else{fs.mkdirSync('frames_v2',{recursive:true});const D=await p.evaluate(()=>DURATION);const N=Math.ceil(D*30);const geo=[];
  for(let i=0;i<N;i++){const t=i/30;await p.evaluate(t=>seek(t),t);geo.push(await p.evaluate(t=>pres(t),t));
   await p.screenshot({path:`frames_v2/f${String(i).padStart(4,'0')}.png`,type:'png'});}
  fs.writeFileSync('geo_v2.json',JSON.stringify(geo));console.log('frames',N);}
 await b.close();})();
