'use strict';
const Report=(()=>{
  function header(row){row.height=28;row.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'},size:11};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF294E3B'}};c.alignment={vertical:'middle',wrapText:true};});}
  async function build(b,m,ed,ex){const wb=new ExcelJS.Workbook();
    const sh=wb.addWorksheet('Ведомость'),h=1;
    sh.addRow(b.headers);
    for(const row of b.rows)sh.addRow(row);
    let width=b.headers.length;function col(name,aliases){const i=b.headers.findIndex(v=>(aliases||[]).some(a=>Data.head(a)===Data.head(v)));if(i>=0)return i+1;sh.getCell(h,++width).value=name;return width;}
    const f=col('Найдено',['Найдено']),p=col('Факт. место',['Факт. Место','Фактическое место']),s=col('Серийный номер (факт)'),t=col('Время сверки (UTC)'),n=col('Примечание сверки');
    b.rows.forEach((r,i)=>{const row=sh.getRow(h+i+1),e=ed.get(i)||{};row.getCell(f).value=e.found?'Да':'Нет';row.getCell(p).value=e.location||'';row.getCell(s).value=Data.serial(b,ed,i);row.getCell(t).value=e.time||'';row.getCell(n).value=e.note||'';if(e.found)for(let j=1;j<=width;j++)row.getCell(j).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE1F1D8'}};});
    b.headers.forEach((v,i)=>sh.getColumn(i+1).width=Math.min(48,Math.max(15,v.length+2,...b.rows.slice(0,60).map(r=>(r[i]||'').length+2))));
    for(const[i,w]of[[f,13],[p,22],[s,28],[t,29],[n,36]])sh.getColumn(i).width=w;header(sh.getRow(h));sh.views=[{state:'frozen',ySplit:h}];const lastRow=h+b.rows.length;sh.autoFilter={from:{row:h,column:1},to:{row:lastRow,column:width}};
    const out=wb.addWorksheet('Вне базы');out.addRow(['Код','Факт. место','Время сверки (UTC)','Примечание']);for(const a of ex.values())out.addRow([a.code,a.location||'',a.time||'',a.note||'']);header(out.getRow(1));[32,24,29,40].forEach((v,i)=>out.getColumn(i+1).width=v);out.views=[{state:'frozen',ySplit:1}];out.autoFilter='A1:D'+(ex.size+1);return new Uint8Array(await wb.xlsx.writeBuffer());}
  function backup(b,m,ed,ex){return {format:'sverka-inventory',version:1,manual:m.manual===true,title:m.title,location:m.location||'',base:{headers:b.headers,rows:b.rows,numbers:b.numbers,map:b.map},edits:[...ed.values()],extras:[...ex.values()]};}
  return {build,backup};
})();
