'use strict';
const Data=(()=>{
  const fields={
    group:['Номер Inside','inside','комплект','номер пк','номер компьютера','computer','group'],
    id:['ID устройства','ID','идентификатор','код устройства','device id','asset id'],
    inv:['Инвентарный номер','инв. №','инв. номер','инвентарный №','инвентарник','inventory number','inventory','asset tag','номер','код'],
    serial:['Серийный номер','серийный №','серийник','сер номер','заводской номер','serial number','serial no','serial','s/n','sn','service tag'],
    barcode:['Штрихкод / QR','штрихкод','штрих-код','bar code','barcode','qr','qr код','qr code','ean','ean13'],
    name:['Наименование','название','имя','название устройства','устройство','оборудование','модель','name','model','description','item','наименование оборудования'],
    dept:['Отдел','подразделение','департамент','department','dept','владелец'],
    place:['Плановое место','место','местоположение','расположение','кабинет','помещение','локация','location','room','адрес','место установки']
  };
  const ids=['serial','inv','id','barcode','group'];
  const types=Object.freeze({computer:'Компьютер',device:'Устройство',other:'Другое'});
  const typeLabel=type=>Object.hasOwn(types,type)?types[type]:'';
  const validType=type=>type===undefined||type===''||!!typeLabel(type);
  const clean=s=>s==null?'':String(s).trim();
  const norm=s=>clean(s).toUpperCase().replace(/\s+/g,'').replace(/^С(?=\d+$)/,'C');
  const head=s=>clean(s).toLowerCase().replace(/ё/g,'е').replace(/№/g,'номер').replace(/[^a-zа-я0-9]/g,'');
  function map(headers){const out={};for(const k of Object.keys(fields))out[k]=headers.findIndex(h=>fields[k].some(a=>head(a)===head(h)));return out;}
  function decode(b,enc){
    if(!enc||enc==='auto'){
      if(b[0]===255&&b[1]===254||b[1]===0&&b[3]===0)enc='utf-16le';
      else if(b[0]===254&&b[1]===255||b[0]===0&&b[2]===0)enc='utf-16be';
      else{try{return new TextDecoder('utf-8',{fatal:true}).decode(b);}catch(e){enc='windows-1251';}}
    }
    return new TextDecoder(enc).decode(b).replace(/^\uFEFF/,'');
  }
  function delimiter(s){
    const chars=[';','\t',',','|'],counts=chars.map(()=>new Map());let row=[0,0,0,0],quoted=false,n=0;
    function record(){row.forEach((v,i)=>{if(v)counts[i].set(v,(counts[i].get(v)||0)+1);});row=[0,0,0,0];n++;}
    for(let i=0;i<s.length&&n<25;i++){
      const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"')i++;else quoted=!quoted;}
      else if(!quoted && (c==='\r'||c==='\n')){if(c==='\r'&&s[i+1]==='\n')i++;record();}
      else if(!quoted){const j=chars.indexOf(c);if(j>=0)row[j]++;}
    }
    record();let best=0,d='';counts.forEach((m,i)=>{for(const [v,f]of m){const score=f*100+Math.min(v,30);if(score>best){best=score;d=chars[i];}}});return d;
  }
  function parse(s,sep){
    if(s.includes('\0'))throw Error('В тексте обнаружены нулевые байты. Проверьте кодировку.');
    const rows=[],numbers=[];let row=[],v='',quoted=false,line=1,start=1;
    function end(){row.push(clean(v));if(row.some(Boolean)){rows.push(row);numbers.push(start);}if(rows.length>25030||row.length>160)throw Error('Лимит ведомости — 25 000 строк и 160 столбцов.');row=[];v='';}
    for(let i=0;i<s.length;i++){
      const c=s[i];if(c==='"'&&(quoted||!v)){if(quoted&&s[i+1]==='"'){v+='"';i++;}else quoted=!quoted;}
      else if(!quoted&&sep&&c===sep){row.push(clean(v));v='';}
      else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;if(quoted)v+='\n';else end();line++;if(!quoted)start=line;}
      else v+=c;
      if(v.length>32767||row.length>160)throw Error('Слишком длинное поле. Проверьте разделитель.');
    }
    if(quoted)throw Error('В файле есть незакрытые кавычки.');end();return {rows,numbers};
  }
  function zip(b){
    const v=new DataView(b.buffer,b.byteOffset,b.byteLength);let p=b.length-22;const min=Math.max(0,b.length-65557);
    while(p>=min&&v.getUint32(p,true)!==0x06054b50)p--;
    if(p<min)throw Error('Файл XLSX повреждён или зашифрован.');
    const count=v.getUint16(p+10,true);let n=v.getUint32(p+16,true),total=0;
    if(count>8000)throw Error('В книге слишком много файлов.');
    for(let i=0;i<count;i++){if(n+46>p||v.getUint32(n,true)!==0x02014b50)throw Error('Повреждён каталог книги XLSX.');
      if(v.getUint16(n+8,true)&1)throw Error('Сохраните книгу без пароля.');total+=v.getUint32(n+24,true);
      if(total>80*1024*1024)throw Error('Книга слишком велика. Сохраните отдельный лист.');n+=46+v.getUint16(n+28,true)+v.getUint16(n+30,true)+v.getUint16(n+32,true);}
  }
  function cell(c){let v=c.value;if(v&&typeof v==='object'&&('formula' in v||'sharedFormula' in v))v=v.result;
    if(v instanceof Date)return v.toISOString().replace(/T00:00:00.000Z$/,'');
    if(v&&typeof v==='object')return v.richText?v.richText.map(r=>r.text).join('').trim():clean(v.text||v.error||'');
    if(Number.isInteger(v)&&/^0{2,}$/.test(c.numFmt||''))return String(v).padStart(c.numFmt.length,'0');return clean(v);}
  function grid(sheet){const rows=[],numbers=[];sheet.eachRow((r,n)=>{const a=[];r.eachCell((c,i)=>{const v=cell(c);if(v){if(i>160||v.length>32767)throw Error('Превышен размер строки Excel.');a[i-1]=v;}});
    if(a.length){rows.push(Array.from(a,x=>x||''));numbers.push(n);}if(rows.length>25030)throw Error('На листе больше 25 000 строк.');});return {rows,numbers};}
  function guess(g){let at=0,best=0;g.rows.slice(0,30).forEach((r,i)=>{const n=Object.values(map(r)).filter(x=>x>=0).length;if(n>best){best=n;at=i;}});return {at,header:best>0};}
  function layout(g,at,header){const n=g.rows.slice(at).reduce((m,r)=>Math.max(m,r.length),0);
    const headers=Array.from({length:n},(_,i)=>header&&g.rows[at][i]||'Столбец '+(i+1));const mapping=map(headers);
    if(!ids.some(k=>mapping[k]>=0)){let i=headers.findIndex((_,i)=>!Object.values(mapping).includes(i));if(i>=0)mapping.serial=i;}
    return {headers,map:mapping,first:at+(header?1:0)};}
  function base(g,l){const rows=g.rows.slice(l.first);if(!rows.length||rows.length>25000)throw Error('В ведомости должно быть от 1 до 25 000 позиций.');
    if(!ids.some(k=>l.map[k]>=0)||!rows.some(r=>ids.some(k=>clean(r[l.map[k]]))))throw Error('Назначьте столбец с заполненными номерами, ID или штрихкодами.');
    const cols=Object.values(l.map).filter(v=>v>=0);if(new Set(cols).size!==cols.length)throw Error('Один столбец назначен дважды.');
    return {headers:l.headers,map:l.map,rows,numbers:g.numbers.slice(l.first)};}
  function value(b,i,k){return b.rows[i][b.map[k]]||'';}
  function serial(b,ed,i){const e=ed.get(i);return e&&typeof e.serial==='string'?e.serial:value(b,i,'serial');}
  function index(b,ed){const table=new Map();b.rows.forEach((_,i)=>{const set=new Set(ids.map(k=>norm(k==='serial'?serial(b,ed,i):value(b,i,k))).filter(Boolean));for(const code of set){if(!table.has(code))table.set(code,[]);table.get(code).push(i);}});return table;}
  function match(t,raw){const k=norm(raw);return t.get(k)||(/^\d+$/.test(k)?t.get('C'+k):null)||[];}
  function candidates(raw){const vals=[],seen=new Set();const put=v=>{v=clean(v).replace(/^[#=:：\s]+|[,;:\s]+$/g,'');if(v&&v.length<=180&&!seen.has(v)){vals.push(v);seen.add(v);}};
    const lines=raw.split(/[\r\n]+/).map(clean).filter(Boolean);
    for(let i=0;i<lines.length;i++){const m=lines[i].match(/^(?:s\s*[/.\-]?\s*n|serial(?:\s*(?:number|no\.?))?|service\s*tag|серийный\s*(?:номер|№))\s*(?:[:#=：]\s*|\s+|$)(.*)$/i);if(m)put(m[1]||lines[i+1]);}
    for(const line of lines)for(const t of line.split(/\s+/))if(/\d/.test(t)&&/[a-zа-я]/i.test(t)&&t.length>=3)put(t);
    lines.forEach(put);return vals.slice(0,30);}
  function closeCode(a,b){if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,n=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++n>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return n+a.length-i+b.length-j===1;}
  function suggestions(values,table,only){const vs=values.map(norm).filter(v=>v.length>=5&&v.length<81&&!v.includes(':')).slice(0,6),exact=[],near=[];
    for(const[k,rows]of table){if(only!==undefined&&!rows.includes(only))continue;
      if(vs.includes(k))exact.push({key:k,i:only===undefined?rows[0]:only,exact:true});else if(near.length<6&&vs.some(v=>closeCode(v,k)))near.push({key:k,i:only===undefined?rows[0]:only,exact:false});}return exact.concat(near).slice(0,6);}
  const safeStr=s=>typeof s==='string'&&s.length<=32767;
  function restore(d){
    if(!d||d.format!=='sverka-inventory'||d.version!==1)throw Error('Это не резервная копия Сверки версии 1.');
    const b=d.base;if(!b||!Array.isArray(b.headers)||!b.headers.length||b.headers.length>160||!b.headers.every(safeStr)||
      !Array.isArray(b.rows)||(!b.rows.length&&d.manual!==true)||b.rows.length>25000||!b.rows.every(r=>Array.isArray(r)&&r.length<=b.headers.length&&r.every(safeStr))||
      !Array.isArray(b.numbers)||b.numbers.length!==b.rows.length||!b.numbers.every(n=>Number.isInteger(n)&&n>0)||
      !b.map||!Object.keys(fields).every(k=>Number.isInteger(b.map[k])&&b.map[k]>=-1&&b.map[k]<b.headers.length)||!ids.some(k=>b.map[k]>=0))throw Error('Повреждена исходная ведомость.');
    if(d.manual===true&&(b.headers.length!==2||b.map.name!==0||b.map.serial!==1))throw Error('Повреждена ведомость офиса.');
    const seen=new Set(),codes=new Set();
    if(!Array.isArray(d.edits)||d.edits.length>b.rows.length||!d.edits.every(e=>{if(!e||!Number.isInteger(e.i)||e.i<0||e.i>=b.rows.length||seen.has(e.i))return false;seen.add(e.i);return ['location','time','note','serial'].every(k=>e[k]===undefined||safeStr(e[k]))&&(e.found===undefined||typeof e.found==='boolean')&&validType(e.assetType);}))throw Error('Повреждены отметки.');
    if(!Array.isArray(d.extras)||d.extras.length>50000||!d.extras.every(e=>{if(!e||!safeStr(e.code)||!norm(e.code)||codes.has(norm(e.code)))return false;codes.add(norm(e.code));return ['location','note','time'].every(k=>e[k]===undefined||safeStr(e[k]))&&validType(e.assetType);}))throw Error('Повреждены записи вне базы.');
    return d;}
  return {fields,ids,types,typeLabel,norm,head,decode,delimiter,parse,zip,grid,guess,layout,map,base,value,serial,index,match,candidates,suggestions,restore};
})();
const DB=(()=>{
  let db;
  function open(){return new Promise((ok,bad)=>{const r=indexedDB.open('sverka-local',1);r.onupgradeneeded=()=>{for(const s of ['books','bases','marks','prefs'])r.result.createObjectStore(s,{keyPath:'id'});};r.onsuccess=()=>{db=r.result;db.onversionchange=()=>db.close();ok();};r.onerror=()=>bad(r.error);});}
  function get(name,id){return new Promise((ok,bad)=>{const s=db.transaction(name).objectStore(name),r=id===undefined?s.getAll():s.get(id);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}
  function put(values){return new Promise((ok,bad)=>{const tx=db.transaction(values.map(v=>v[0]),'readwrite');tx.oncomplete=ok;tx.onabort=()=>bad(tx.error||Error('Запись прервана.'));try{for(const [n,v]of values)tx.objectStore(n).put(v);}catch(e){tx.abort();bad(e);}});}
  function remove(stores,id){
    return new Promise((ok,bad)=>{
      const tx=db.transaction(stores,'readwrite');
      tx.oncomplete=ok;
      tx.onabort=()=>bad(tx.error||Error('Удаление не завершено.'));
      for(const name of stores)tx.objectStore(name).delete(id);
    });
  }
  return {open,get,put,remove};
})();
