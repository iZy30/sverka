'use strict';
const $=id=>document.getElementById(id);
const glyphs={plus:"M12 5v14M5 12h14",export:'M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4',import:'M12 15V3m-4 4 4-4 4 4M4 16v4h16v-4',folder:'M3 7V5h6l2 2h10v12H3z',pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',scan:'M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4m5-8v8m3-8v8m3-8v8m3-8v8',text:'M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4m5-7h8m-4 0v7m-2 0h4',keyboard:'M3 6h18v12H3z M6 10h1m2 0h1m2 0h1m2 0h1m-9 4h8',enter:'M4 12h15m-5-5 5 5-5 5',search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',box:'M3 7l9-4 9 4v11l-9 4-9-4z M3 7l9 4 9-4m-9 4v11',check:'M4 12l5 5L20 6',extra:'M12 3l10 17H2z M12 9v4m0 3v.5',back:'M20 12H4m6-6-6 6 6 6',close:'M6 6l12 12M18 6 6 18',copy:'M8 8h12v13H8z M16 8V3H3v13h5'};
function icon(k){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','ico');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',glyphs[k]);svg.appendChild(p);return svg;}
function el(tag,cls,t){const v=document.createElement(tag);if(cls)v.className=cls;if(t!==undefined)v.textContent=t;return v;}
function button(t,cls,fn,k){const b=el('button',cls,t);b.type='button';b.onclick=fn;if(k)b.prepend(icon(k));return b;}
const S={meta:null,base:null,ed:new Map(),ex:new Map(),idx:null,tab:'left',q:'',limit:60,view:'home',busy:false,ready:false,received:false,last:null};
const tick=()=>new Date().toISOString();
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>x.toString(16).padStart(2,'0')).join('');
const nowText=t=>t?new Date(t).toLocaleString('ru-RU',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
let focusFrom=null,onCancel=null;
function modal(title,cancel){const first=$('veil').hidden;if(first)focusFrom=document.activeElement;onCancel=cancel||null;
  $('dialogTitle').textContent=title;$('body').textContent='';$('actions').textContent='';$('error').hidden=true;$('veil').hidden=false;document.body.style.overflow='hidden';$('shell').setAttribute('aria-hidden','true');$('body').scrollTop=0;if(first)$('dismiss').focus();}
function closeDialog(){onCancel=null;$('veil').hidden=true;document.body.style.overflow='';$('shell').removeAttribute('aria-hidden');$('body').textContent='';$('actions').textContent='';if(focusFrom&&document.contains(focusFrom))focusFrom.focus({preventScroll:true});focusFrom=null;}
function cancelDialog(){if(S.busy)return;if(onCancel){const f=onCancel;onCancel=null;f();}else closeDialog();}
function action(t,fn,cls){const b=button(t,cls||'primary',fn);$('actions').append(b);return b;}
function choice(t,sub,fn,k){const b=button('','option',fn,k),s=el('span',null,t);if(sub)s.append(el('small',null,sub));b.append(s);return b;}
function hint(t){$('body').append(el('p','hint',t));}
function field(label,v,parent){const l=el('label','form',label);l.append(v);(parent||$('body')).append(l);return v;}
function input(v='',ph='',max=1024){const e=el('input');e.value=v||'';e.placeholder=ph;e.maxLength=max;e.autocomplete='off';return e;}
function select(opts,v){const s=el('select');for(const [value,t]of opts){const opt=el('option',null,t);opt.value=value;s.append(opt);}s.value=String(v);return s;}
function check(label,v){const c=el('input');c.type='checkbox';c.checked=!!v;const l=el('label','check');l.append(c,document.createTextNode(label));$('body').append(l);return c;}
function note(t,cls,bt,fn){$('feedback').hidden=false;$('feedback').className='feedback '+(cls||'');$('msg').textContent=t;$('revert').hidden=!bt;$('revert').textContent=bt||'';$('revert').onclick=fn||null;}
function fail(e){const t=e&&e.name==='QuotaExceededError'?'Недостаточно памяти для сохранения ведомости.':e&&e.message||'Действие не удалось.';
  if(!$('veil').hidden){$('error').textContent=t;$('error').hidden=false;}
  else if(S.view==='books'){modal('Действие не удалось');hint(t);action('Закрыть',closeDialog,'outline');}
  else note(t,'bad');}
async function run(fn){if(S.busy)return;S.busy=true;try{return await fn();}catch(e){fail(e);}finally{S.busy=false;}}
function get(i,k){return Data.value(S.base,i,k);}
function serial(i){return Data.serial(S.base,S.ed,i);}
function name(i){const n=get(i,'name');return n&&n!=='(без наименования в Inside)'?n:get(i,'id')?'Устройство '+get(i,'id'):serial(i)||get(i,'inv')||get(i,'barcode')||get(i,'group')||'Строка '+S.base.numbers[i];}
function codes(i){return [get(i,'group'),get(i,'id')?'ID '+get(i,'id'):'',serial(i)?'S/N '+serial(i):'',get(i,'inv')?'Инв. '+get(i,'inv'):'',get(i,'dept')].filter(Boolean).join(' · ');}
function matches(i,q){if(!q)return true;const e=S.ed.get(i)||{};return S.base.rows[i].concat(serial(i),e.note,e.location).join(' ').toLowerCase().includes(q);}
function row(t,sub,status,fn){const b=button('','row',fn),mark=el('i',status);mark.append(icon(status==='found'?'check':status==='extra'?'extra':'box'));const s=el('span','text');s.append(el('strong',null,t),el('small',null,sub));b.append(mark,s,el('span','arrow','›'));return b;}
async function create(meta,b,ed=[],ex=[]){
  const id=uid(),m=Object.assign({},meta,{id,created:tick(),count:b.rows.length});await DB.put([['books',m],['bases',Object.assign({},b,{id})],['marks',{id,ed,ex}],['prefs',{id:'active',value:id}]]);await load(id,false);}
async function load(id,remember=true){
  const [m,b,w]=await Promise.all([DB.get('books',id),DB.get('bases',id),DB.get('marks',id)]);if(!m||!b||!w)throw Error('Ведомость недоступна.');
  if(remember)await DB.put([['prefs',{id:'active',value:id}]]);
  S.meta=m;S.base=b;S.ed=new Map(w.ed.map(e=>[e.i,e]));S.ex=new Map(w.ex.map(e=>[Data.norm(e.code),e]));S.idx=Data.index(b,S.ed);S.q='';S.tab='left';S.limit=60;S.last=null;
  $('q').value='';$('number').value='';$('feedback').hidden=true;home();render();window.scrollTo(0,0);}
function home(){S.view='home';$('home').hidden=false;$('ledgers').hidden=true;$('report').hidden=false;}
async function books(){const all=await DB.get('books');S.view='books';$('home').hidden=true;$('ledgers').hidden=false;$('report').hidden=true;$('booklist').textContent='';
  $('toHome').hidden=!S.meta;
  $('repeat').hidden=!S.meta;
  $('noBooks').hidden=all.length>0;
  for(const m of all.sort((a,b)=>b.created.localeCompare(a.created))){const active=m.id===S.meta?.id,b=button('','book'+(active?' current':''),()=>run(()=>load(m.id)),active?'check':'folder');const s=el('span','text');s.append(el('strong',null,m.title),el('small',null,m.count+' поз. · '+(active?'Текущая ведомость':new Date(m.created).toLocaleDateString('ru-RU'))));b.append(s,el('span','arrow','›'));$('booklist').append(b);}window.scrollTo(0,0);}
function render(){const b=S.base,n=b.rows.length,f=[...S.ed.values()].filter(e=>e.found).length,p=n?Math.round(f*100/n):0;
  $('newDevice').hidden=!S.meta.manual;
  $('bookName').textContent='';$('bookName').append(icon('folder'),document.createTextNode(S.meta.title));$('done').textContent=f;$('total').textContent=n;$('pct').textContent=p+'%';$('fill').style.width=p+'%';$('meter').setAttribute('aria-valuenow',p);
  $('loc').textContent='';$('loc').append(icon('pin'),document.createTextNode(S.meta.location||'Указать место'));
  const groups=new Map();if(b.map.group>=0)b.rows.forEach((_,i)=>{const k=Data.norm(get(i,'group'));if(k)groups.set(k,groups.get(k)!==false&&!!(S.ed.get(i)||{}).found);});
  $('groups').textContent=groups.size?'Комплекты '+[...groups.values()].filter(Boolean).length+' / '+groups.size:'Осталось '+(n-f);
  const counts={left:n-f,found:f,extra:S.ex.size};document.querySelectorAll('[data-tab]').forEach(x=>{const on=x.dataset.tab===S.tab;x.classList.toggle('on',on);x.setAttribute('aria-selected',on);x.querySelector('b').textContent=counts[x.dataset.tab];});list();}
function list(){const out=document.createDocumentFragment(),q=S.q.toLowerCase().trim();let hits=0;
  if(S.tab==='extra'){for(const e of [...S.ex.values()].sort((a,b)=>(b.time||'').localeCompare(a.time||''))){if(q&&![e.code,e.location,e.note].join(' ').toLowerCase().includes(q))continue;if(++hits<=S.limit)out.append(row(e.code,[e.location,e.note,nowText(e.time)].filter(Boolean).join(' · '),'extra',()=>outside(e)));}}
  else{const ids=S.tab==='found'?[...S.ed.values()].filter(e=>e.found).sort((a,b)=>(b.time||'').localeCompare(a.time||'')).map(e=>e.i):S.base.rows.keys();for(const i of ids){if(S.tab==='left'&&(S.ed.get(i)||{}).found||!matches(i,q))continue;if(++hits<=S.limit)out.append(row(name(i),codes(i),S.tab,()=>card(i)));}}
  if(!hits)out.append(el('p','empty',q?'Совпадений нет.':S.tab==='extra'?'Здесь появятся коды, которых нет в ведомости.':S.tab==='found'?'Пока нет отмеченных позиций.':S.base.rows.length?'Все позиции найдены.':'В этой ведомости пока нет оборудования.'));$('items').textContent='';$('items').append(out);$('more').hidden=hits<=S.limit;}
async function change(mods,extras,remember=true){
  const ed=new Map(S.ed),ex=new Map(S.ex),rev=[],rx=[];let reindex=false;
  for(const[i,v]of mods){const old=ed.get(i);rev.push([i,old]);if((old||{}).serial!==(v||{}).serial)reindex=true;if(v)ed.set(i,Object.assign({},v,{i}));else ed.delete(i);}
  for(const[k,v]of extras){rx.push([k,ex.get(k)]);if(v)ex.set(k,v);else ex.delete(k);}
  await DB.put([['marks',{id:S.meta.id,ed:[...ed.values()],ex:[...ex.values()]}]]);S.ed=ed;S.ex=ex;if(reindex)S.idx=Data.index(S.base,ed);S.last=remember?{id:S.meta.id,rev,rx}:null;render();}
function changed(t,cls){note(t,cls,'Отменить',()=>run(async()=>{const r=S.last;if(r&&r.id===S.meta.id){await change(r.rev,r.rx,false);note('Последнее изменение отменено.');}}));}
async function mark(ids,raw){const fresh=ids.filter(i=>!(S.ed.get(i)||{}).found);
  if(!fresh.length){note('Уже отмечено: '+raw,'warn','Открыть',()=>card(ids[0]));return;}
  const t=tick();await change(fresh.map(i=>{const e=Object.assign({},S.ed.get(i),{found:true,time:t});if(S.meta.location)e.location=S.meta.location;return [i,e];}),[]);
  changed(fresh.length===1?'Найдено: '+name(fresh[0]):'Комплект '+raw+' · отмечено позиций: '+fresh.length);}
async function scan(raw){raw=String(raw||'').trim();if(!raw)return;if(raw.length>1024)throw Error('Код длиннее 1024 символов. Введите номер с этикетки.');
  const k=Data.norm(raw),ids=Data.match(S.idx,raw);
  if(!ids.length){if(S.meta.manual){addDevice(raw);return;}if(S.ex.has(k)){note('Уже записано вне базы: '+raw,'warn','Открыть',()=>outside(S.ex.get(k)));return;}
    await change([],[[k,{code:raw,time:tick(),location:S.meta.location||'',note:''}]]);changed('Вне базы: '+raw,'warn');return;}
  if(ids.length===1){await mark(ids,raw);return;}
  const group=Data.norm(get(ids[0],'group')),shared=!!group&&(k===group||/^\d+$/.test(k)&&'C'+k===group)&&ids.every(i=>Data.norm(get(i,'group'))===group);
  modal('Совпало несколько позиций');hint(shared?'Номер '+raw+' общий для комплекта. Выберите одну позицию или подтвердите весь комплект.':'Код '+raw+' есть у нескольких строк. Выберите конкретную позицию.');
  const l=el('div','choice-list');for(const i of ids)l.append(choice(name(i),codes(i)+((S.ed.get(i)||{}).found?' · Найдено':''),()=>run(async()=>{closeDialog();await mark([i],raw);})));$('body').append(l);
  if(shared)action('Отметить комплект · '+ids.length,()=>run(async()=>{closeDialog();await mark(ids,raw);}));}
function addOffice() {
  modal('Добавить офис');
  const title=field('Название офиса',input('','Например, Владивосток',120));
  const save=action('Создать ведомость',()=>run(async()=>{
    const office=title.value.trim();
    if(!office)throw Error('Введите название офиса.');
    const headers=['Наименование','Серийный номер'];
    await create({title:office,location:'',manual:true},{headers,rows:[],numbers:[],map:Data.map(headers)});
    closeDialog();
  }));
  title.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save.click();}};
  title.focus();
}
function addDevice(scannedCode='') {
  modal('Добавить оборудование');
  const label=field('Наименование',input('','Например, монитор',250));
  const code=field('Код или серийный номер',input(scannedCode,'Введите номер с этикетки'));
  const place=field('Фактическое место',input(S.meta.location,'Кабинет или площадка',250));
  action('Добавить в ведомость',()=>run(async()=>{
    const value=code.value.trim();
    if(!value)throw Error('Введите код или серийный номер.');
    if(Data.match(S.idx,value).length)throw Error('Этот номер уже есть в ведомости.');
    if(S.base.rows.length>=25000)throw Error('Достигнут предел в 25 000 позиций.');
    const i=S.base.rows.length;
    const base=Object.assign({},S.base,{rows:S.base.rows.concat([[label.value.trim()||value,value]]),numbers:S.base.numbers.concat([(S.base.numbers.at(-1)||1)+1])});
    const meta=Object.assign({},S.meta,{count:base.rows.length});
    const mark={i,found:true,location:place.value.trim(),time:tick()};
    const edits=new Map(S.ed).set(i,mark);
    await DB.put([['books',meta],['bases',base],['marks',{id:meta.id,ed:[...edits.values()],ex:[...S.ex.values()]}]]);
    S.meta=meta;
    S.base=base;
    S.ed=edits;
    S.idx=Data.index(base,edits);
    S.last=null;
    S.tab='found';
    S.q='';
    $('q').value='';
    closeDialog();
    render();
    note('Добавлено: '+name(i));
  }));
  if(!scannedCode)label.focus();
}
function locationDialog(){modal('Место сверки');hint('Это место будет записано у следующих найденных позиций.');const x=field('Кабинет или площадка',input(S.meta.location,'Например, каб. 204',250));
  action('Сохранить',()=>run(async()=>{const m=Object.assign({},S.meta,{location:x.value.trim()});await DB.put([['books',m]]);S.meta=m;closeDialog();render();}));}
function card(i,draft,external){
  const old=S.ed.get(i)||{},d=draft||{serial:serial(i),location:old.location===undefined?S.meta.location:old.location,note:old.note,found:old.found};modal(name(i));const kv=el('div','data');
  function pair(k,v){if(!v)return;const r=el('div','kv');r.append(el('span',null,k),el('strong',null,v));kv.append(r);}
  for(const k of ['group','id','inv','barcode','dept','place'])pair(Data.fields[k][0],get(i,k));if(old.found)pair('Отмечено',nowText(old.time));if(kv.childNodes.length)$('body').append(kv);
  const s=field('Серийный номер',input(d.serial,'Введите или считайте с наклейки'));const buttons=el('div','inline');$('body').append(buttons);
  const p=field('Фактическое место',input(d.location,'Кабинет или площадка',250));const t=el('textarea');t.value=d.note||'';t.rows=2;t.maxLength=2000;field('Примечание',t);const found=check('Позиция найдена',d.found);
  const draftNow=()=>({serial:s.value.trim(),location:p.value.trim(),note:t.value.trim(),found:found.checked});
  for(const [mode,text,k]of [['code','Штрихкод / QR','scan'],['ocr','Текст с камеры','text']])buttons.append(button(text,'outline',()=>openCamera(mode,{project:S.meta.id,i,external,draft:draftNow()}),k));
  if(external)hint('После сохранения номер перейдёт из списка «Вне базы» в карточку.');
  action('Сохранить',()=>run(async()=>{const e=draftNow(),k=Data.norm(e.serial);
    if(k&&k!==Data.norm(serial(i))&&(S.idx.get(k)||[]).some(j=>j!==i))throw Error('Номер уже привязан к другой позиции.');
    e.time=e.found?(old.found&&old.time||tick()):'';const remove=external&&external===k&&S.ex.has(k)?[[k,null]]:[];
    await change([[i,e]],remove);closeDialog();changed('Карточка сохранена: '+name(i));}));}
function outside(e){const k=Data.norm(e.code);modal('Позиция вне базы');$('body').append(el('div','data',e.code));const p=field('Фактическое место',input(e.location,'Кабинет или площадка',250)),t=field('Примечание',input(e.note,'Что за оборудование',2000));
  $('body').append(choice('Привязать к позиции','Записать как серийный номер устройства.',()=>chooseItem(e,p.value,t.value),'scan'));
  action('Удалить',()=>run(async()=>{await change([],[[k,null]]);closeDialog();changed('Код удалён из списка вне базы.');}),'danger');
  action('Сохранить',()=>run(async()=>{await change([],[[k,Object.assign({},e,{location:p.value.trim(),note:t.value.trim()})]]);closeDialog();changed('Запись сохранена.');}));}
function chooseItem(e,p,t){modal('Привязать серийный номер');hint('Номер '+e.code+' · выберите устройство.');const q=field('Найти устройство',input('','Название или номер'));const l=el('div','choice-list');$('body').append(l);
  function show(){l.textContent='';let n=0;for(let i=0;i<S.base.rows.length;i++){if(!matches(i,q.value.trim().toLowerCase()))continue;l.append(choice(name(i),codes(i),()=>card(i,{serial:e.code,location:p||(S.ed.get(i)||{}).location||S.meta.location,note:t||(S.ed.get(i)||{}).note||'',found:true},Data.norm(e.code))));if(++n>=60)break;}if(!n)l.append(el('p','empty','Совпадений нет.'));}q.oninput=show;show();}
function openCamera(mode,ctx){if(window.Phone)Phone.scan(mode,JSON.stringify(ctx));else fail(Error('Камера доступна в приложении Android.'));}
function cameraValue(v,ctx){if(ctx.i!==undefined){card(ctx.i,Object.assign({},ctx.draft,{serial:v}),ctx.external);return;}closeDialog();return scan(v);}
function cameraResult(mode,raw,ctx){if(ctx.project!==S.meta?.id)throw Error('Открыта другая ведомость. Повторите сканирование.');if(mode==='code')return cameraValue(raw,ctx);
  const values=Data.candidates(raw);modal('Проверьте серийный номер',ctx.i===undefined?null:()=>card(ctx.i,ctx.draft,ctx.external));hint('Сверьте символы с наклейкой, особенно O и 0, I и 1. Номер можно исправить.');const box=field('Распознанный номер',input(values[0]||''));
  const pick=(v,b)=>{box.value=v;$('body').querySelectorAll('.option').forEach(n=>n.classList.toggle('sel',b===n));};
  const near=Data.suggestions(values,S.idx,ctx.i);if(near.length)hint('Сопоставление с ведомостью');for(const h of near){const v=Data.ids.map(k=>k==='serial'?serial(h.i):get(h.i,k)).find(x=>Data.norm(x)===h.key)||h.key;const b=choice(v,(h.exact?'Точное совпадение':'Отличие в одном символе')+' · '+name(h.i),()=>pick(v,b));b.dataset.known=h.key;$('body').append(b);}
  if(values.length>1){hint('Текст с наклейки');const l=el('div','choice-list');for(const v of values){const b=choice(v,'',()=>pick(v,b));l.append(b);}$('body').append(l);}
  action('Принять номер',()=>run(()=>{if(!box.value.trim())throw Error('Введите номер.');return cameraValue(box.value.trim(),ctx);}));}
function repeatBook(){modal('Повторная сверка');hint('Новая ведомость получит позиции и уточнённые серийные номера. Отметки предыдущей проверки сохранятся в прежней ведомости.');
  const x=field('Название новой ведомости',input(S.meta.title.slice(0,90)+' · '+new Date().toLocaleDateString('ru-RU'),'',120));
  action('Начать сверку',()=>run(async()=>{if(!x.value.trim())throw Error('Введите название.');const e=[...S.ed.values()].filter(v=>typeof v.serial==='string').map(v=>({i:v.i,serial:v.serial}));const m={title:x.value.trim(),location:S.meta.location};if(S.meta.manual)m.manual=true;await create(m,S.base,e);closeDialog();note('Новая сверка начата.');}));}
function pickFile(){if(window.Phone)Phone.open();else{$('file').value='';$('file').click();}}
async function importBytes(file,bytes){
  if(bytes.length>32*1024*1024)throw Error('Файл превышает 32 МБ.');const ext=file.toLowerCase().split('.').pop();
  if(ext==='json'){let d;try{d=JSON.parse(Data.decode(bytes,'utf-8'));}catch(e){throw Error('Не удалось прочитать резервную копию.');}
    Data.restore(d);modal('Восстановить ведомость');hint('Будет создана отдельная ведомость со всеми сохранёнными результатами.');const title=field('Название',input(String(d.title||'Ведомость').slice(0,110)+' · копия','',120));
    $('body').append(el('div','data',d.base.rows.length+' поз. · найдено '+d.edits.filter(x=>x.found).length+' · вне базы '+d.extras.length));action('Восстановить',()=>run(async()=>{if(!title.value.trim())throw Error('Введите название.');await create({title:title.value.trim(),location:String(d.location||'').slice(0,250),manual:d.manual===true},d.base,d.edits,d.extras);closeDialog();note('Ведомость восстановлена.');}));return;}
  const c={title:file.replace(/\.[^.]*$/,'').slice(0,120)||'Новая ведомость',bytes,enc:'auto',sep:'auto',sheet:0};
  if(ext==='xlsx'){Data.zip(bytes);const w=new ExcelJS.Workbook();try{await w.xlsx.load(bytes);}catch(e){throw Error('Не удалось открыть XLSX. Проверьте формат и пароль.');}c.sheets=w.worksheets.filter(s=>s.state!=='veryHidden'&&s.rowCount);if(!c.sheets.length)throw Error('В книге нет непустых листов.');}
  else if(!['csv','txt','tsv'].includes(ext))throw Error('Выберите CSV, XLSX, TXT или резервную копию JSON.');
  readGrid(c);}
function readGrid(c){if(c.sheets)c.g=Data.grid(c.sheets[c.sheet]);else{let s=Data.decode(c.bytes,c.enc);const m=s.match(/^sep=(.)\r?\n/i);if(m)s=s.slice(m[0].length);c.auto=m?m[1]:Data.delimiter(s);c.g=Data.parse(s,c.sep==='auto'?c.auto:c.sep);}
  if(!c.g.rows.length)throw Error('В файле нет непустых строк.');Object.assign(c,Data.guess(c.g));wizard(c);}
function wizard(c){modal('Импорт ведомости');const title=field('Название ведомости',input(c.title,'',120));title.oninput=()=>c.title=title.value;
  if(c.sheets){const sh=field('Лист Excel',select(c.sheets.map((s,i)=>[i,s.name]),c.sheet));sh.onchange=()=>run(()=>{c.sheet=+sh.value;readGrid(c);});}
  else{const p=el('div','pair');$('body').append(p);const enc=field('Кодировка',select([['auto','Авто'],['utf-8','UTF-8'],['windows-1251','Windows-1251'],['utf-16le','UTF-16 LE'],['utf-16be','UTF-16 BE']],c.enc),p);
    const sepNames={'':'По одному номеру',';':'Точка с запятой',',':'Запятая','\t':'Табуляция','|':'Вертикальная черта'};const sep=field('Разделитель',select([['auto','Авто · '+sepNames[c.auto]],...Object.entries(sepNames)],c.sep),p);
    enc.onchange=()=>run(()=>{c.enc=enc.value;readGrid(c);});sep.onchange=()=>run(()=>{c.sep=sep.value;readGrid(c);});}
  const start=field('Первая строка таблицы',select(c.g.rows.slice(0,30).map((r,i)=>[i,c.g.numbers[i]+' · '+r.filter(Boolean).slice(0,3).join(' / ').slice(0,85)]),c.at));start.onchange=()=>{c.at=+start.value;wizard(c);};
  const h=check('В этой строке заголовки столбцов',c.header);h.onchange=()=>{c.header=h.checked;wizard(c);};const l=Data.layout(c.g,c.at,c.header);
  const preview=el('div','preview'),table=el('table'),thead=el('tr');for(const n of l.headers)thead.append(el('th',null,n));table.append(thead);
  for(const r of c.g.rows.slice(l.first,l.first+3)){const tr=el('tr');for(const v of r)tr.append(el('td',null,v));table.append(tr);}preview.append(table);$('body').append(preview);hint('Проверьте соответствие столбцов. Остальные поля тоже попадут в отчёт.');
  const p=el('div','pair');$('body').append(p);for(const k of ['serial','inv','id','group','barcode','name','dept','place']){
    const vals=[[-1,'Не задан'],...l.headers.map((v,i)=>[i,(i+1)+' · '+v])];const s=field(Data.fields[k][0],select(vals,l.map[k]),p);s.dataset.map=k;s.onchange=()=>{l.map[k]=+s.value;summary();};}
  const n=c.g.rows.length-l.first,info=el('p','summary');$('body').append(info);
  function summary(){const missing=c.g.rows.slice(l.first).filter(r=>!Data.ids.some(k=>r[l.map[k]])).length;info.textContent=n+' позиций'+(missing?' · без номера: '+missing+' (доступны для ручной отметки)':'');}summary();
  action('Создать ведомость · '+n,()=>run(async()=>{if(!c.title.trim())throw Error('Введите название.');const b=Data.base(c.g,l);await create({title:c.title.trim(),location:''},b);closeDialog();note('Импортировано позиций: '+n);}));}
async function receivePhone(){if(!S.ready||S.received||!window.Phone)return;if(S.busy){setTimeout(receivePhone,100);return;}const s=Phone.pending();if(!s)return;const e=JSON.parse(s);S.received=true;
  try{await run(async()=>{if(e.type==='file'){const r=await fetch('incoming/'+encodeURIComponent(e.token),{cache:'no-store'});if(!r.ok)throw Error('Выберите файл ещё раз.');await importBytes(e.name,new Uint8Array(await r.arrayBuffer()));}
    else if(e.type==='scan')await cameraResult(e.mode,e.text,JSON.parse(e.context));else if(e.type==='error')throw Error(e.message);else if(e.type==='saved')note(e.message);});}
  finally{Phone.ack(e.id);S.received=false;if(Phone.pending())setTimeout(receivePhone,0);}}
function fileName(kind){const d=new Date(),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');return S.meta.title.replace(/[^a-zA-Zа-яА-ЯёЁ0-9 ._-]/g,'_').slice(0,80)+'_'+date+(kind==='json'?'.sverka.json':'.xlsx');}
async function transfer(bytes,kind,share){const fname=fileName(kind);if(!window.Phone){const u=URL.createObjectURL(new Blob([bytes]));const a=el('a');a.href=u;a.download=fname;a.click();setTimeout(()=>URL.revokeObjectURL(u),4000);return;}
  if(!Phone.begin(fname,kind))throw Error('Не удалось подготовить файл.');try{for(let i=0;i<bytes.length;i+=98304){const c=bytes.subarray(i,i+98304);let bin='';for(let j=0;j<c.length;j+=8192)bin+=String.fromCharCode.apply(null,c.subarray(j,j+8192));if(!Phone.chunk(btoa(bin)))throw Error('Не удалось записать файл. Проверьте свободное место.');}
    if(!Phone.finishFile(!!share))throw Error('Не удалось открыть системное окно Android.');}catch(e){Phone.abort();throw e;}}
function exportDialog(){modal('Отчёт и резервная копия');$('body').append(el('div','data',S.meta.title+' · найдено '+[...S.ed.values()].filter(x=>x.found).length+' из '+S.base.rows.length+' · вне базы '+S.ex.size));
  function save(k,share){return run(async()=>{const bs=$('body').querySelectorAll('button');bs.forEach(b=>b.disabled=true);const p=el('p','hint','Готовим файл…');$('body').append(p);try{const bytes=k==='xlsx'?await Report.build(S.base,S.meta,S.ed,S.ex):new TextEncoder().encode(JSON.stringify(Report.backup(S.base,S.meta,S.ed,S.ex)));
    if(k==='json'&&bytes.length>32*1024*1024)throw Error('Копия превышает 32 МБ. Сохраните отчёт Excel.');await transfer(bytes,k,share);closeDialog();}finally{bs.forEach(b=>b.disabled=false);p.remove();}});}
  $('body').append(choice('Отчёт Excel','Найденное выделено зелёным. Коды вне базы вынесены на отдельный лист.',()=>save('xlsx'),'export'),choice('Резервная копия','Ведомость и отметки в JSON для переноса на другой телефон.',()=>save('json'),'copy'));
  if(window.Phone)$('body').append(choice('Поделиться отчётом','Выбрать приложение для отправки Excel.',()=>save('xlsx',true),'export'));}
function back(){if(S.busy)return true;if(!$('veil').hidden){cancelDialog();return true;}if(S.view==='books'&&S.meta){home();render();return true;}return false;}
async function init(){
  document.querySelectorAll('[data-icon]').forEach(v=>v.prepend(icon(v.dataset.icon)));$('books').onclick=()=>run(books);$('toHome').onclick=()=>{home();render();};$('loc').onclick=locationDialog;$('report').onclick=exportDialog;$('import').onclick=pickFile;$('repeat').onclick=repeatBook;$('newOffice').onclick=addOffice;$('newDevice').onclick=()=>addDevice();
  $('dismiss').onclick=cancelDialog;$('veil').onclick=e=>{if(e.target===$('veil'))cancelDialog();};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&back())e.preventDefault();
    if(e.key==='Tab'&&!$('veil').hidden){const opts=Array.from($('sheet').querySelectorAll('button,input,select,textarea')).filter(x=>!x.disabled&&x.offsetParent!==null);if(opts.length&&((e.shiftKey&&document.activeElement===opts[0])||(!e.shiftKey&&document.activeElement===opts[opts.length-1]))){e.preventDefault();opts[e.shiftKey?opts.length-1:0].focus();}}});
  $('bar').onclick=()=>openCamera('code',{project:S.meta.id});$('ocr').onclick=()=>openCamera('ocr',{project:S.meta.id});
  $('manual').onsubmit=e=>{e.preventDefault();run(async()=>{await scan($('number').value);$('number').value='';});};
  $('q').oninput=()=>{S.q=$('q').value;S.limit=60;list();};$('more').onclick=()=>{S.limit+=80;list();};
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;S.limit=60;render();});
  $('file').onchange=e=>{const f=e.target.files[0];if(f)run(async()=>importBytes(f.name,new Uint8Array(await f.arrayBuffer())));};
  await DB.open();
  const current=await DB.get('prefs','active');
  const all=await DB.get('books');
  // Only discard the original automatically installed ledger if it is unused.
  const original=all.find(b=>b.template==='abrek'&&b.title==='Абрекская 12'&&!b.location);
  if(original){
    const marks=await DB.get('marks',original.id);
    if(marks&&!marks.ed.length&&!marks.ex.length){
      await DB.remove(['books','bases','marks'],original.id);
      all.splice(all.indexOf(original),1);
    }
  }
  if(all.length)await load(current&&all.some(b=>b.id===current.value)?current.value:all[0].id,false);
  else await books();
  $('boot').hidden=true;S.ready=true;window.back=back;window.receivePhone=receivePhone;await receivePhone();}
init().catch(e=>{$('boot').textContent='Не удалось открыть ведомость: '+(e.message||e);$('boot').className='err';});
