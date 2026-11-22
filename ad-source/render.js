const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
(async()=>{
 const mode=process.argv[2]; const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1080,height:1920}});
 await p.goto('file://'+path.resolve('index.html')+'?render'); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(500);
 if(mode==='preview'){ for(const t of [2.5,6.5,8.8,11.5,13.5,18,24.5]){ await p.evaluate(t=>seek(t),t); await p.screenshot({path:`prev_${t}.jpg`,quality:70,type:'jpeg'});} }
 else { fs.mkdirSync('frames',{recursive:true}); const D=await p.evaluate(()=>DURATION); const N=Math.round(D*30);
   for(let i=0;i<N;i++){ await p.evaluate(t=>seek(t),i/30); await p.screenshot({path:`frames/f${String(i).padStart(4,'0')}.jpg`,quality:93,type:'jpeg'}); }
   console.log('frames',N); }
 await b.close();})();
