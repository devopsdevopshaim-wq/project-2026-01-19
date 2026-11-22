const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
(async()=>{
 const mode=process.argv[2]; const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1080,height:1920}});
 await p.goto('file://'+path.resolve('index_presenter.html')+'?render'); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(500);
 const times = mode==='preview' ? [3,7.3,10,16,22,30] : null;
 if(times){ for(const t of times){ await p.evaluate(t=>seek(t),t); await p.screenshot({path:`pv_${t}.jpg`,type:'jpeg',quality:70}); } }
 else { fs.mkdirSync('frames_p',{recursive:true}); const N=35*30; const geo=[];
   for(let i=0;i<N;i++){ const t=i/30; await p.evaluate(t=>seek(t),t); geo.push(await p.evaluate(t=>pres(t),t));
     await p.screenshot({path:`frames_p/f${String(i).padStart(4,'0')}.png`,type:'png'}); }
   fs.writeFileSync('geo.json',JSON.stringify(geo)); console.log('frames',N); }
 await b.close();})();
