  // ---------- Slip OCR (Tesseract.js) ----------
  // ต้องวางโค้ดนี้ "ภายใน" (function(){ ... })() เพราะใช้ตัวแปร input, renderInput, toast, $ ของแอป
  const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
  const slipInput=$('slipInput'), ocrBox=$('ocr'), ocrText=$('ocrText'), ocrSub=$('ocrSub'), ocrBar=$('ocrBar');
  let ocrWorker=null, ocrJob=0, ocrIdle=null, ocrOnProgress=null;

  function loadOcrLib(){
    if(window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((res,rej)=>{
      const sc=document.createElement('script');
      sc.src=TESSERACT_SRC; sc.async=true;
      sc.onload=()=> window.Tesseract ? res(window.Tesseract) : rej(new Error('no Tesseract'));
      sc.onerror=()=>{ sc.remove(); rej(new Error('โหลด Tesseract.js ไม่สำเร็จ')); };
      document.head.appendChild(sc);
    });
  }
  async function getOcrWorker(){
    clearTimeout(ocrIdle);
    if(ocrWorker) return ocrWorker;
    const T = await loadOcrLib();
    ocrWorker = await T.createWorker(['tha','eng'], 1, {
      logger: m => { if(ocrOnProgress) ocrOnProgress(m); }
    });
    return ocrWorker;
  }
  // ปิด worker เมื่อไม่ได้ใช้ 60 วินาที เพื่อคืนหน่วยความจำ (มือถือ)
  function releaseOcrLater(){
    clearTimeout(ocrIdle);
    ocrIdle=setTimeout(()=>{ if(ocrWorker){ ocrWorker.terminate(); ocrWorker=null; } }, 60000);
  }

  // ย่อ/ขยายรูปให้พอดี แล้วแปลงเป็นขาวดำเพิ่มคอนทราสต์ ช่วยให้อ่านแม่นขึ้น
  async function prepImage(file){
    let src;
    try{ src = await createImageBitmap(file); }
    catch(e){
      src = await new Promise((res,rej)=>{
        const img=new Image(), url=URL.createObjectURL(file);
        img.onload=()=>{ URL.revokeObjectURL(url); res(img); };
        img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('เปิดรูปไม่ได้')); };
        img.src=url;
      });
    }
    const w0=src.width, h0=src.height;
    const scale = w0 < 1000 ? 1400/w0 : (w0 > 2000 ? 2000/w0 : 1);
    const c=document.createElement('canvas');
    c.width=Math.round(w0*scale); c.height=Math.round(h0*scale);
    const g=c.getContext('2d', { willReadFrequently:true });
    g.drawImage(src, 0, 0, c.width, c.height);
    const d=g.getImageData(0,0,c.width,c.height), px=d.data;
    for(let i=0;i<px.length;i+=4){
      let y = 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2];
      y = Math.max(0, Math.min(255, (y-128)*1.35 + 128));
      px[i]=px[i+1]=px[i+2]=y;
    }
    g.putImageData(d,0,0);
    return c;
  }

  // ดึง "ยอดเงิน" ออกจากข้อความ OCR ของสลิป
  // คืนค่า { amount: number|null, candidates: [{value, score, line}] }
  function extractAmount(raw){
    const text = String(raw||'')
      .replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)))   // เลขไทย → อารบิก
      .replace(/[，‚]/g, ',').replace(/[。·]/g, '.')
      .replace(/(\d)\s*([.,])\s*(\d)/g, '$1$2$3')                  // "1, 250 . 00" → "1,250.00"
      .replace(/\r/g, '');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const KEY = /(จำนวน|ยอด|amount|total|โอนเงิน|ชำระ|จ่าย|รับเงิน|pay)/i;
    const CUR_AFTER = /^\s*(บาท|บ\.|thb|baht|฿)/i;
    const CUR = /(บาท|thb|baht|฿)/i;
    const BAD = /(ค่าธรรมเนียม|fee|คงเหลือ|balance|available|เลขที่|รหัส|ref|อ้างอิง|บัญชี|acc|a\/c|โทร|tel|พร้อมเพย์|promptpay|x{2,}|\*{2,})/i;
    const DATE = /(ม\.?ค|ก\.?พ|มี\.?ค|เม\.?ย|พ\.?ค|มิ\.?ย|ก\.?ค|ส\.?ค|ก\.?ย|ต\.?ค|พ\.?ย|ธ\.?ค|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}:\d{2})/i;
    // ตัวเลขแบบมีคอมม่าคั่นหลักพัน หรือเลขล้วน ตามด้วยทศนิยม 2 ตำแหน่ง (ถ้ามี)
    const NUM = /(?<![\d.,:\/-])(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{2}))?(?![\d:\/]|[.,]\d)/g;

    const found = [];
    lines.forEach((line, i) => {
      const prev = lines[i-1] || '';
      let m; NUM.lastIndex = 0;
      while((m = NUM.exec(line))){
        const intPart = m[1].replace(/,/g, ''), dec = m[2];
        const value = parseFloat(intPart + (dec ? '.'+dec : ''));
        if(!(value > 0) || intPart.length > 9) continue;
        const after = line.slice(m.index + m[0].length);
        const hasComma = m[1].includes(',');
        let score = 0;
        if(dec) score += 3;
        if(hasComma) score += 1;
        if(CUR_AFTER.test(after)) score += 4; else if(CUR.test(line)) score += 1;
        if(KEY.test(line) && !BAD.test(line)) score += 4;
        else if(KEY.test(prev) && !BAD.test(prev) && line.length < 24) score += 3;
        if(BAD.test(line)) score -= 6;
        if(DATE.test(line)) score -= 3;
        if(!dec && !hasComma && intPart.length >= 5) score -= 4;   // น่าจะเป็นเลขอ้างอิง
        if(!dec && !CUR.test(line) && !KEY.test(line)) score -= 2;
        found.push({ value, score, line });
      }
    });
    found.sort((a,b) => b.score - a.score);
    const best = found[0];
    return { amount: best && best.score >= 3 ? best.value : null, candidates: found.slice(0,5) };
  }

  function setOcrUI(text, progress, sub){
    ocrText.textContent=text;
    if(sub!==undefined) ocrSub.textContent=sub;
    if(progress==null){ ocrBar.classList.add('indet'); ocrBar.firstElementChild.style.width=''; }
    else { ocrBar.classList.remove('indet'); ocrBar.firstElementChild.style.width=Math.round(progress*100)+'%'; }
  }
  function infoToast(msg, ms){
    toast.className='toast info'; toast.textContent=msg;
    requestAnimationFrame(()=>toast.classList.add('show'));
    clearTimeout(showToast._t);
    showToast._t=setTimeout(()=>toast.classList.remove('show'), ms||2200);
  }
  function amountToInput(v){
    const r=Math.round(v*100)/100;
    const [a,b]=String(r).split('.');
    if(a.length > MAX_DIGITS) return null;
    return b ? a+'.'+b.slice(0,2) : a;
  }

  async function readSlip(file){
    if(!file) return;
    if(!/^image\//.test(file.type)){ infoToast('กรุณาเลือกไฟล์รูปภาพ'); return; }
    const job=++ocrJob;
    ocrBox.hidden=false;
    setOcrUI('กำลังอ่านสลิป...', null, ocrWorker ? 'กำลังเตรียมรูปภาพ' : 'ครั้งแรกต้องดาวน์โหลดตัวอ่านภาษาไทย อาจใช้เวลาสักครู่');
    ocrOnProgress = m => {
      if(job!==ocrJob) return;
      if(m.status==='recognizing text') setOcrUI('กำลังอ่านสลิป... '+Math.round(m.progress*100)+'%', m.progress, 'กำลังหายอดเงิน');
      else if(/load|initial/i.test(m.status)) setOcrUI('กำลังอ่านสลิป...', m.progress>0 && m.progress<1 ? m.progress : null, 'กำลังโหลดตัวอ่านข้อความ');
    };
    try{
      const [canvas, worker] = await Promise.all([prepImage(file), getOcrWorker()]);
      if(job!==ocrJob) return;
      const { data } = await worker.recognize(canvas);
      if(job!==ocrJob) return;
      const { amount, candidates } = extractAmount(data.text);
      console.log('[OCR]', data.text, candidates);
      const str = amount!=null ? amountToInput(amount) : null;
      if(str){
        input=str; renderInput();
        numEl.classList.add('pop'); setTimeout(()=>numEl.classList.remove('pop'),230);
        infoToast('อ่านได้ ฿'+fmt(amount)+' · ปัดเพื่อบันทึก', 2800);
      } else {
        infoToast('หายอดเงินไม่เจอ ลองรูปที่ชัดขึ้น', 2800);
      }
    }catch(err){
      console.warn('OCR error', err);
      if(job===ocrJob) infoToast(navigator.onLine ? 'อ่านสลิปไม่สำเร็จ ลองใหม่อีกครั้ง' : 'ต้องต่ออินเทอร์เน็ตเพื่ออ่านสลิป', 2800);
      if(job===ocrJob && ocrWorker){ try{ ocrWorker.terminate(); }catch(e){} ocrWorker=null; }
    }finally{
      if(job===ocrJob){ ocrBox.hidden=true; ocrOnProgress=null; releaseOcrLater(); }
    }
  }

  $('slipBtn').addEventListener('click', ()=>{ slipInput.value=''; slipInput.click(); });
  slipInput.addEventListener('change', ()=>readSlip(slipInput.files && slipInput.files[0]));
  $('ocrCancel').addEventListener('click', ()=>{
    ocrJob++; ocrBox.hidden=true; ocrOnProgress=null;
    if(ocrWorker){ ocrWorker.terminate(); ocrWorker=null; }   // หยุดงานที่ค้างอยู่ทันที
  });

