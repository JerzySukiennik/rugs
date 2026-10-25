(async()=>{
 const w=(ms)=>new Promise(r=>setTimeout(r,ms));
 const log={}; RR.report=()=>log;
 const q=new URLSearchParams(location.search);
 const c=RR.debug.rugFlat('persian','M',0.3,-3.0,0.35,false);
 RR.debug.rugRolled('shag','M',-2.2,-0.9,1.1);
 RR.debug.rugRolled('kilim','S',-1.7,-0.2,1.3);
 await w(1500);
 let sd=7; const rnd=()=>{sd=(sd*16807)%2147483647; return sd/2147483647;};
 for (let k=0;k<+(q.get('n')||420);k++){ const a=rnd()*Math.PI*2, r=Math.sqrt(rnd()); const u=0.3+Math.cos(a)*r*0.24, v=0.48+Math.sin(a)*r*0.36; if (u<0.04||u>0.96||v<0.04||v>0.96) continue; RR.chem.deposit(c,{u,v},'foam','foamer',+(q.get('foam')||0.025)); }
 await w(400);
 const px=+(q.get('px')||1.9), pz=+(q.get('pz')||-0.8);
 RR.debug.teleport(px, pz, 0, 0); await w(400);
 RR.debug.holdHose(); await w(700);
 const t=c.uvToWorld(+(q.get('tu')||0.6),+(q.get('tv')||0.45)).point;
 RR.debug.look(t.x, t.y, t.z); await w(200);
 RR.debug.lmb(true);
 await w(+(q.get('spray')||2500));
 log.held=RR.grab.held?.item?.label ?? RR.grab.held?.kind; log.flow=RR.hose?.flowing;
 RR.uiHidden=true;
 document.querySelectorAll('#rr-guide,#rr-buddy-tip').forEach(e=>e.style.display='none');
 log.done=true;
})(); 1
