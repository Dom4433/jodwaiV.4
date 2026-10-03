  // ---------- History ----------
  // อ่านทุก key "jodwai:ปี-เดือน-วัน" ใน localStorage แล้วจัดกลุ่มตามวัน (ใหม่ → เก่า)
  // ถ้าวันไหนมีแค่ยอดสรุปใน archive (ไม่มีรายการละเอียด) จะแสดงยอดสรุปแทน
  const histModal=$('histModal'), histBody=$('histBody');
  const HIST_PAGE=30;
  let histDays=[], histShown=0;
  const CHEV='<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  function parseDayKey(k){
    const m=/^jodwai:(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(k);
    return m ? new Date(+m[1], +m[2]-1, +m[3]) : null;
  }
  function dayLabel(d){
    const t=new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff=Math.round((t - d)/86400000);
    if(diff===0) return 'วันนี้';
    if(diff===1) return 'เมื่อวาน';
    return d.toLocaleDateString('th-TH',{weekday:'short', day:'numeric', month:'short', year:'numeric'});
  }
  function collectHistory(){
    const map={};
    try{
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i), d=k && parseDayKey(k);
        if(!d) continue;
        const list=loadDay(k);
        if(list.length) map[k.slice(7)]={ d, list };
      }
      // วันที่มีแต่ยอดสรุปใน archive
      const arc=JSON.parse(localStorage.getItem('jodwai:archive')||'{}')||{};
      Object.keys(arc).forEach(id=>{
        if(map[id]) return;
        const d=parseDayKey('jodwai:'+id), s=arc[id];
        if(d && s && s.count) map[id]={ d, list:null, sum:s };
      });
    }catch(e){}
    return Object.values(map).map(day=>{
      let inc=0,out=0,count=0;
      if(day.list){ day.list.forEach(e=> e.t==='in'?inc+=e.v:out+=e.v); count=day.list.length; }
      else { inc=day.sum.in||0; out=day.sum.out||0; count=day.sum.count||0; }
      return Object.assign(day,{ inc, out, net:inc-out, count });
    }).sort((a,b)=>b.d-a.d);
  }
  function dayHTML(day, open){
    const net=day.net;
    const rows = day.list
      ? day.list.slice().reverse().map(e=>{
          const time=e.at ? new Date(e.at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) : '';
          return '<li><span class="time">'+time+'</span><span class="tg">'+esc(e.tag||'อื่นๆ')+'</span>'
            +'<span class="amt '+e.t+'">'+(e.t==='in'?'+':'−')+fmt(e.v)+'</span></li>';
        }).join('')
      : '<li><span class="only-sum">มีเฉพาะยอดสรุปของวันนี้</span></li>';
    return '<details class="hday"'+(open?' open':'')+'><summary>'
      +'<span class="hd"><span class="lbl">'+dayLabel(day.d)+'</span>'
      +'<span class="sub">'+day.count+' รายการ · <span class="i">+'+fmt(day.inc)+'</span> · <span class="o">−'+fmt(day.out)+'</span></span></span>'
      +'<span class="net '+(net>0?'pos':net<0?'neg':'')+'">'+(net<0?'−':net>0?'+':'')+fmt(Math.abs(net))+'</span>'
      +CHEV+'</summary><ul class="hrows">'+rows+'</ul></details>';
  }
  function renderHistoryPage(){
    const more=histBody.querySelector('.hmore'); if(more) more.remove();
    const next=histDays.slice(histShown, histShown+HIST_PAGE);
    histBody.insertAdjacentHTML('beforeend', next.map((d,i)=>dayHTML(d, histShown+i<2)).join(''));
    histShown+=next.length;
    if(histShown<histDays.length){
      histBody.insertAdjacentHTML('beforeend','<button class="btn ghost hmore" type="button">ดูวันก่อนหน้าอีก</button>');
      histBody.querySelector('.hmore').style.color='var(--ink)';
      histBody.querySelector('.hmore').onclick=renderHistoryPage;
    }
  }
  function openHistory(){
    checkDayChange();
    histDays=collectHistory(); histShown=0; histBody.innerHTML='';
    if(!histDays.length){
      $('histMeta').textContent='';
      histBody.innerHTML='<div class="empty-row">ยังไม่มีประวัติ เริ่มจดรายการแรกได้เลย</div>';
    } else {
      const inc=histDays.reduce((a,d)=>a+d.inc,0), out=histDays.reduce((a,d)=>a+d.out,0);
      $('histMeta').textContent='บันทึกไว้ '+histDays.length+' วัน · รับรวม +'+fmt(inc)+' · จ่ายรวม −'+fmt(out);
      renderHistoryPage();
    }
    histBody.scrollTop=0;
    openModal(histModal);
  }
  $('histBtn').onclick=openHistory;

