package ru.it.inventory.qa;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.view.*;
import android.webkit.WebView;
import android.widget.Button;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import ru.it.inventory.Main;
import ru.it.inventory.Scanner;

/** Runs against a separately installed, identically signed release on a disposable Android 11+ profile. */
public final class DeviceChecks extends Instrumentation {
    private Main app; private WebView web; private String mode;
    private final ArrayList<String> passed=new ArrayList<>();
    private final ArrayList<Uri> docs=new ArrayList<>();
    @Override public void onCreate(Bundle b){super.onCreate(b);mode=b==null?null:b.getString("mode");start();}
    @Override public void onStart(){Bundle out=new Bundle();int code=Activity.RESULT_CANCELED;
        try{Context c=getTargetContext();if(c.checkSelfPermission(Manifest.permission.INTERNET)==PackageManager.PERMISSION_GRANTED)throw new AssertionError("Internet permission present");
            getUiAutomation().grantRuntimePermission(c.getPackageName(),Manifest.permission.CAMERA);
            app=(Main)startActivitySync(new Intent(c,Main.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            runOnMainSync(()->web=findWeb(app.getWindow().getDecorView()));await("typeof S!=='undefined'&&S.ready",110);
            if("live".equals(mode))live();else if("resume".equals(mode))resume();else flow();
            code=Activity.RESULT_OK;out.putString("stream","\nPASS "+passed.size()+" checks\n");
        }catch(Throwable t){StringWriter sw=new StringWriter();t.printStackTrace(new PrintWriter(sw));out.putString("stream","\nFAILED after "+passed+"\n"+sw+"\n");}
        finally{for(Uri u:docs)try{getTargetContext().getContentResolver().delete(u,null,null);}catch(Exception ignored){}}
        finish(code,out);}
    private WebView findWeb(View v){if(v instanceof WebView)return (WebView)v;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){WebView w=findWeb(g.getChildAt(i));if(w!=null)return w;}}return null;}
    private Button button(View v,String s){if(v instanceof Button&&s.contentEquals(((Button)v).getText()))return (Button)v;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){Button b=button(g.getChildAt(i),s);if(b!=null)return b;}}return null;}
    private String js(String expr)throws Exception{CountDownLatch l=new CountDownLatch(1);AtomicReference<String> a=new AtomicReference<>();runOnMainSync(()->web.evaluateJavascript(expr,v->{a.set(v);l.countDown();}));if(!l.await(45,TimeUnit.SECONDS))throw new AssertionError("WebView timeout");return a.get();}
    private void await(String condition,int s)throws Exception{long end=SystemClock.elapsedRealtime()+s*1000L;while(SystemClock.elapsedRealtime()<end){if("true".equals(js("!!("+condition+")")))return;SystemClock.sleep(250);}throw new AssertionError("Timeout "+condition+" UI "+js("document.body.innerText.slice(0,1000)"));}
    private void pass(String text){passed.add(text);Bundle b=new Bundle();b.putString("stream","PASS "+text+"\n");sendStatus(0,b);}
    private Uri newDoc(String name,String mime,boolean image)throws Exception{ContentValues v=new ContentValues();v.put(MediaStore.MediaColumns.DISPLAY_NAME,name);v.put(MediaStore.MediaColumns.MIME_TYPE,mime);v.put(MediaStore.MediaColumns.RELATIVE_PATH,image?"Pictures/SverkaQA":"Download/SverkaQA");v.put(MediaStore.MediaColumns.IS_PENDING,1);
        Uri u=getTargetContext().getContentResolver().insert(image?MediaStore.Images.Media.EXTERNAL_CONTENT_URI:MediaStore.Downloads.EXTERNAL_CONTENT_URI,v);if(u==null)throw new IOException("MediaStore");docs.add(u);return u;}
    private Uri fixture(String name,String mime,boolean image)throws Exception{Uri u=newDoc(name,mime,image);ContentResolver r=getTargetContext().getContentResolver();try(InputStream in=getContext().getAssets().open(name);OutputStream out=r.openOutputStream(u)){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
        ContentValues v=new ContentValues();v.put(MediaStore.MediaColumns.IS_PENDING,0);r.update(u,v,null,null);return u;}
    private ActivityMonitor pick(String act,Uri u)throws Exception{IntentFilter f=new IntentFilter(act);f.addCategory(Intent.CATEGORY_OPENABLE);f.addDataType("*/*");return addMonitor(f,new ActivityResult(Activity.RESULT_OK,new Intent().setData(u)),true);}
    private void openFile(String name,String type)throws Exception{js("books()");await("S.view==='books'",25);ActivityMonitor m=pick(Intent.ACTION_OPEN_DOCUMENT,fixture(name,type,false));
        try{js("$('import').click()");await("!$('veil').hidden&&$('dialogTitle').textContent==='Импорт ведомости'&&!S.busy",85);}finally{removeMonitor(m);}}
    private void create()throws Exception{js("$('actions').querySelector('button').click()");await("$('veil').hidden&&!S.busy",45);}
    private void manual(String v)throws Exception{js("$('number').value="+JSONObject.quote(v)+";$('submit').click()");await("!S.busy",25);}
    private Scanner scanner(boolean text)throws Exception{ActivityMonitor m=addMonitor(Scanner.class.getName(),null,false);try{js(text?"$('ocr').click()":"$('bar').click()");Activity a=waitForMonitorWithTimeout(m,45000);if(a==null)throw new AssertionError("Scanner did not start");return (Scanner)a;}finally{removeMonitor(m);}}
    private void photo(String name,boolean textMode)throws Exception{Uri u=fixture(name,"image/png",true);Scanner a=scanner(textMode);ActivityMonitor m=pick(Intent.ACTION_OPEN_DOCUMENT,u);try{runOnMainSync(()->button(a.getWindow().getDecorView(),"Из фото").performClick());
        long end=SystemClock.elapsedRealtime()+125000;while(!a.isFinishing()&&!a.isDestroyed()&&SystemClock.elapsedRealtime()<end)SystemClock.sleep(250);if(!a.isFinishing()&&!a.isDestroyed())throw new AssertionError("Camera image processing timeout "+name);}finally{removeMonitor(m);}}
    private String confirmOcr()throws Exception{await("!$('veil').hidden&&$('dialogTitle').textContent==='Проверьте серийный номер'",90);String raw=js("document.querySelector('#body input').value");
        if(!"\"XT74-5823\"".equals(raw)){await("document.querySelector('[data-known=\\\"XT74-5823\\\"]')",15);js("document.querySelector('[data-known=\\\"XT74-5823\\\"]').click()");}
        js("$('actions').querySelector('button').click()");await("S.ed.get(3)&&S.ed.get(3).found",35);return raw;}
    private void flow()throws Exception{
        pass("Offline start without INTERNET permission");
        openFile("ledger.csv","text/csv");create();manual("0000789");await("S.base.rows.length===4&&S.ed.get(0).found",40);pass("Native document selection, CP1251 CSV, leading zero");
        photo("qr.png",false);await("S.ed.get(1)&&S.ed.get(1).found",45);pass("On-device model reads QR");
        photo("bar.png",false);await("S.ed.get(2)&&S.ed.get(2).found",45);pass("On-device model reads Code 128");
        photo("ocr.png",true);pass("On-device OCR and confirmation, raw "+confirmOcr());
        manual("QA-NOT-IN-DB");await("S.ex.size===1",20);
        Uri out=newDoc("sverka-qa.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",false);ActivityMonitor m=pick(Intent.ACTION_CREATE_DOCUMENT,out);
        try{js("$('report').click();$('body').querySelector('button').click()");await("$('msg').textContent.startsWith('Сохранено')",120);}finally{removeMonitor(m);}
        try(InputStream in=getTargetContext().getContentResolver().openInputStream(out)){if(in.read()!='P'||in.read()!='K')throw new AssertionError("No XLSX bytes");}pass("Android writes exported XLSX to content URI");
        openFile("sheets.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        js("const sh=document.querySelector('#body select');sh.value='1';sh.dispatchEvent(new Event('change'))");create();manual("000042");await("S.base.rows.length===2&&S.ed.get(0).found",30);pass("Second Excel sheet, heading row, leading zeros");
        openFile("list.txt","text/plain");create();manual("0010002");await("S.base.rows.length===2&&S.ed.get(0).found",30);pass("TXT list without headers");
    }
    private void resume()throws Exception{
        await("S.base.rows.length===2&&serial(0)==='0010002'&&S.ed.get(0).found",30);pass("Private progress survives force-stop and cold launch");
        CountDownLatch sent=new CountDownLatch(1);AtomicReference<Uri> share=new AtomicReference<>();
        ActivityMonitor mon=new ActivityMonitor(){@Override public ActivityResult onStartActivity(Intent i){if(!Intent.ACTION_CHOOSER.equals(i.getAction()))return null;Intent inner=i.getParcelableExtra(Intent.EXTRA_INTENT);if(inner!=null&&(inner.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0)share.set(inner.getParcelableExtra(Intent.EXTRA_STREAM));sent.countDown();return new ActivityResult(Activity.RESULT_CANCELED,null);}};
        addMonitor(mon);try{js("$('report').click();Array.from($('body').querySelectorAll('button')).find(b=>b.textContent.startsWith('Поделиться')).click()");if(!sent.await(75,TimeUnit.SECONDS)||share.get()==null)throw new AssertionError("Missing read-only share URI");try(InputStream in=getTargetContext().getContentResolver().openInputStream(share.get())){if(in.read()!='P'||in.read()!='K')throw new AssertionError("Share content invalid");}}finally{removeMonitor(mon);}pass("Android sharesheet receives readable XLSX");
    }
    private void live()throws Exception{
        openFile("ledger.csv","text/csv");create();
        Scanner bar=scanner(false);await("S.ed.get(1)&&S.ed.get(1).found",95);pass("CameraX live QR frames");
        Scanner camera=scanner(true);long end=SystemClock.elapsedRealtime()+45000;AtomicReference<Boolean> fired=new AtomicReference<>(false);
        while(!fired.get()&&SystemClock.elapsedRealtime()<end){runOnMainSync(()->{Button b=button(camera.getWindow().getDecorView(),"Считать");if(b!=null&&b.isEnabled()){b.performClick();fired.set(true);}});SystemClock.sleep(250);}
        if(!fired.get())throw new AssertionError("CameraX shutter unavailable");pass("CameraX live OCR and confirmation, raw "+confirmOcr());
    }
}
