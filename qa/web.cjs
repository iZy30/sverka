const {chromium}=require('playwright');
const path=require('path'),fs=require('fs'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../app/src/main/assets'),data=path.resolve(__dirname,'../app/src/androidTest/assets');
const out=process.env.QA_OUTPUT||require('os').tmpdir();
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,headless:true,args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:390,height:844},acceptDownloads:true});p.setDefaultTimeout(40000);
 const errs=[],offsite=[];p.on('pageerror',e=>errs.push(String(e)));p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:'))offsite.push(r.url());});
 let n=0;const test=async(t,fn)=>{await fn();console.log('PASS '+(++n)+' '+t);};
 const ready=()=>p.waitForFunction(()=>typeof S!=='undefined'&&S.ready&&!S.busy);
 const id=s=>p.locator('#'+s),txt=s=>id(s).textContent(),btn=s=>p.getByRole('button',{name:s,exact:true});
 const count=async v=>assert.equal(await txt('done'),String(v));
 const scan=async v=>{await id('number').fill(v);await id('submit').click();await ready();};
 const load=async f=>{if(await id('home').isVisible())await id('books').click();await id('ledgers').waitFor();await ready();const fc=p.waitForEvent('filechooser');await id('import').click();await(await fc).setFiles(f);await id('dialogTitle').waitFor({state:'visible'});};
 const create=async()=>{await p.getByRole('button',{name:/^Создать ведомость/}).click();await ready();};
 const save=async(k,f)=>{await id('report').click();const ev=p.waitForEvent('download');await p.getByRole('button',{name:new RegExp('^'+k)}).click();await(await ev).saveAs(path.join(out,f));await ready();};
 try{
  await p.goto('http://127.0.0.1:'+server.address().port);await ready();
  await test('Clean install opens the empty ledger list',async()=>{
    assert.equal(await id('noBooks').isVisible(),true);
    assert.equal(await id('newOffice').isVisible(),true);
    assert.equal(await id('import').isVisible(),true);
    assert.equal(await id('repeat').isVisible(),false);
    assert.deepEqual(await p.evaluate(()=>DB.get('books')),[]);
    await p.screenshot({path:path.join(out,'mobile.png')});
  });
  await test('Office without a file, empty backup, manual and camera entry',async()=>{
    await id('newOffice').click();
    await btn('Создать ведомость').click();
    assert.match(await txt('error'),/Введите название/);
    await p.getByLabel('Название офиса').fill('Тестовый офис');
    await btn('Создать ведомость').click();
    await ready();
    assert.equal(await txt('pct'),'0%');
    assert.equal(await txt('total'),'0');
    await save('Резервная копия','empty-office.sverka.json');
    await load(path.join(out,'empty-office.sverka.json'));
    await btn('Восстановить').click();
    await ready();
    assert.equal(await txt('total'),'0');
    await id('newDevice').click();
    await p.getByLabel('Наименование').fill('Тестовый монитор');
    await p.getByLabel('Код или серийный номер').fill('000042');
    await btn('Добавить в ведомость').click();
    await ready();
    await count(1);
    await p.evaluate(()=>cameraResult('code','QA-OFFICE-2',{project:S.meta.id}));
    assert.equal(await p.getByLabel('Код или серийный номер').inputValue(),'QA-OFFICE-2');
    await p.getByLabel('Наименование').fill('Тестовый принтер');
    await btn('Добавить в ведомость').click();
    await ready();
    await p.reload();
    await ready();
    await count(2);
    assert.equal(await txt('total'),'2');
    await scan('qa-office-2');
    assert.match(await txt('msg'),/Уже/);
    await save('Отчёт Excel','manual-report.xlsx');
  });
  await test('Import a synthetic group for inventory checks',async()=>{
    const fixture='Номер Inside;ID устройства;Наименование\nC122;112;Тестовый ПК\nC122;113;Тестовая мышь\n;114;Тестовый телефон';
    await load({name:'sample-group.csv',mimeType:'text/csv',buffer:Buffer.from(fixture)});
    await create();
    assert.equal(await txt('total'),'3');
  });
  await test('Group selection, single ID, duplicate and undo',async()=>{await scan('С122');assert.match(await txt('dialogTitle'),/несколько/);const g=p.getByRole('button',{name:/^Отметить комплект/}),k=+(await g.textContent()).match(/\d+$/)[0];await g.click();await ready();await count(k);await id('revert').click();await ready();await count(0);await scan('112');await scan('112');await count(1);assert.match(await txt('msg'),/Уже/);});
  await test('Location, outside deduplication and reload',async()=>{await id('loc').click();await p.getByLabel('Кабинет или площадка').fill('204');await btn('Сохранить').click();await ready();await scan('XXX-00001');await scan('xxx-00001');await p.reload();await ready();await count(1);assert.deepEqual(await p.evaluate(()=>[S.meta.location,S.ex.size]),['204',1]);});
  await test('Group Excel export',async()=>save('Отчёт Excel','group-report.xlsx'));
  await test('Full JSON backup and restoration as separate project',async()=>{await save('Резервная копия','roundtrip.sverka.json');await load(path.join(out,'roundtrip.sverka.json'));await btn('Восстановить').click();await ready();await count(1);assert.equal(await p.evaluate(()=>S.ex.size),1);assert.match(await txt('bookName'),/копия/);});
  await test('CP1251 CSV, quoted semicolon, zero-padded text',async()=>{await load(path.join(data,'ledger.csv'));assert.equal(await p.locator('[data-map=serial]').inputValue(),'0');await create();assert.equal(await txt('total'),'4');await scan('0000789');await count(1);assert.match(await txt('msg'),/Монитор; 24/);});
  await test('OCR review, attach new serial, use it on subsequent scan',async()=>{await p.evaluate(()=>cameraResult('ocr','MODEL Z99\nS/N: LN-00074',{project:S.meta.id,i:2,draft:{serial:'',location:'Склад',note:'Тест',found:false}}));assert.equal(await p.getByLabel('Распознанный номер').inputValue(),'LN-00074');await btn('Принять номер').click();await ready();await btn('Сохранить').click();await ready();await scan('ln-00074');await count(2);});
  await test('Bind outside code to recorded item and undo',async()=>{await scan('ZZZ-199');await p.locator('[data-tab=extra]').click();await p.locator('#items .row').first().click();await p.getByRole('button',{name:/^Привязать к позиции/}).click();await p.getByLabel('Найти устройство').fill('Принтер');await p.locator('.choice-list button').first().click();await btn('Сохранить').click();await ready();await count(3);assert.equal(await p.evaluate(()=>S.ex.size),0);await id('revert').click();await ready();await count(2);assert.equal(await p.evaluate(()=>S.ex.size),1);});
  await test('Second XLSX worksheet, title before header and custom number format',async()=>{await load(path.join(data,'sheets.xlsx'));await p.getByLabel('Лист Excel').selectOption('1');await create();assert.equal(await txt('total'),'2');await scan('000042');await count(1);await save('Отчёт Excel','custom-report.xlsx');});
  await test('Plain TXT, separate ledgers and retained progress',async()=>{await load(path.join(data,'list.txt'));await create();await scan('0010002');await count(1);await id('books').click();await p.getByRole('button',{name:/^ledger/}).click();await ready();await count(2);});
  await test('Repeat inventory keeps serial edits; near OCR match needs an explicit choice',async()=>{await id('books').click();await id('repeat').click();await p.getByLabel('Название новой ведомости').fill('Переучёт');await btn('Начать сверку').click();await ready();await count(0);assert.equal(await p.evaluate(()=>serial(2)),'LN-00074');await p.evaluate(()=>cameraResult('ocr','S/N: LN-000074',{project:S.meta.id}));assert.equal(await p.getByLabel('Распознанный номер').inputValue(),'LN-000074');await p.locator('[data-known="LN-00074"]').click();await btn('Принять номер').click();await ready();await count(1);});
  await test('Rejected import preserves current inventory',async()=>{await load({name:'broken.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('bad')});assert.match(await txt('body'),/повреждён/);await id('dismiss').click();await id('toHome').click();await count(1);});
  await test('CSV escaped quotes, multiline values, UTF-16; conflicting serial matches one row',async()=>{const v=await p.evaluate(()=>[Data.parse('S/N,Name\r\n0001,"a, ""x""\nb"\r\n',',').rows,Data.decode(new Uint8Array([255,254,65,0,9,0,66,0])),Data.norm('С122')]);assert.deepEqual(v,[[['S/N','Name'],['0001','a, "x"\nb']],'A\tB','C122']);await load({name:'dups.csv',mimeType:'text/csv',buffer:Buffer.from('S/N;Name\nDUP;A\nDUP;B')});await create();await scan('DUP');assert.equal(await p.getByRole('button',{name:/Отметить комплект/}).count(),0);await p.locator('.choice-list button').last().click();await ready();await count(1);});
  await test('Upgrade discards the unused bundled ledger and keeps user data',async()=>{
    await p.evaluate(async()=>{
      const headers=['Серийный номер'];
      const base={headers,rows:[['__QA_LEGACY__']],numbers:[7],map:Data.map(headers)};
      const original={id:'test-legacy',title:'Абрекская 12',template:'abrek',location:'',count:1,created:'2000-01-01'};
      const edited={...original,id:'test-edited',location:'Кабинет'};
      await DB.put([
        ['books',original],['bases',{...base,id:original.id}],['marks',{id:original.id,ed:[],ex:[]}],
        ['books',edited],['bases',{...base,id:edited.id}],['marks',{id:edited.id,ed:[{i:0,found:true,note:'сохранить'}],ex:[]}],
        ['prefs',{id:'active',value:original.id}]
      ]);
    });
    await p.reload();
    await ready();
    assert.equal(await p.evaluate(()=>DB.get('bases','test-legacy')),undefined);
    assert.equal((await p.evaluate(()=>DB.get('marks','test-edited'))).ed[0].note,'сохранить');
    assert.ok((await p.evaluate(()=>DB.get('books'))).some(book=>book.title==='Переучёт'));
    await id('books').click();
    await p.getByRole('button',{name:/^Абрекская 12/}).click();
    await ready();
    await count(1);
    await save('Отчёт Excel','legacy-report.xlsx');
  });
  await test('Small and tablet widths, no offsite requests or JavaScript errors',async()=>{for(const w of [320,360,412,768]){await p.setViewportSize({width:w,height:820});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}assert.deepEqual(errs,[]);assert.deepEqual(offsite,[]);});
  console.log(n+' browser scenarios passed');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
