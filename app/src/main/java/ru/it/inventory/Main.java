package ru.it.inventory;

import android.app.Activity;
import android.content.*;
import android.content.res.Configuration;
import android.database.Cursor;
import android.net.Uri;
import android.os.*;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.util.Base64;
import android.view.*;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.*;
import android.widget.FrameLayout;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

public final class Main extends Activity {
    static final String HOST="sverka.invalid";
    static final int OPEN=11,SAVE=12,SCAN=13,SHARE=14;
    static final int MIB=1024*1024;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Object fileLock=new Object();
    private FrameLayout root;
    private WebView web;
    private File temp;
    private OutputStream writer;
    private String fileName="",mime="",scanContext="";
    private int length;
    private volatile boolean external;

    private static SharedPreferences appearance(Context context) {
        return context.getSharedPreferences("appearance",MODE_PRIVATE);
    }
    private static boolean systemDark(Context context) {
        int mode=context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode==Configuration.UI_MODE_NIGHT_YES;
    }
    static boolean darkAppearance(Context context) {
        String preference=appearance(context).getString("theme","system");
        return "dark".equals(preference)||("system".equals(preference)&&systemDark(context));
    }

    @Override public void onCreate(Bundle state){
        setTheme(darkAppearance(this)?R.style.AppThemeDark:R.style.AppThemeLight);
        super.onCreate(state);
        cleanCache();
        if(state!=null){
            scanContext=state.getString("context","");fileName=state.getString("name","");external=state.getBoolean("external");
            String path=state.getString("out","");if(!path.isEmpty())temp=new File(path);
        }
        root=new FrameLayout(this);
        web=new WebView(this){
            @Override public InputConnection onCreateInputConnection(EditorInfo editor) {
                InputConnection connection=super.onCreateInputConnection(editor);
                if(connection!=null&&(editor.inputType&InputType.TYPE_MASK_CLASS)==InputType.TYPE_CLASS_NUMBER){
                    editor.inputType=InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_VARIATION_PASSWORD;
                }
                return connection;
            }
        };
        root.addView(web);setContentView(root);insets(root);
        applyAppearance();
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest req){return true;}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest req){return asset(req.getUrl());}
        });
        web.addJavascriptInterface(new Bridge(),"Phone");web.loadUrl("https://"+HOST+"/index.html");
    }
    private void applyAppearance() {
        boolean dark=darkAppearance(this);
        int background=dark?0xff0c100e:0xfff5f5ef;
        root.setBackgroundColor(background);
        web.setBackgroundColor(background);
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(dark?background:0xff1e382c);
        WindowCompat.getInsetsController(getWindow(),root).setAppearanceLightStatusBars(!dark);
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        applyAppearance();
        web.evaluateJavascript("window.refreshSverkaTheme && window.refreshSverkaTheme()",null);
    }

    static void insets(View root){
        if(Build.VERSION.SDK_INT>=35)root.setOnApplyWindowInsetsListener((v,w)->{
            android.graphics.Insets i=w.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());
            v.setPadding(i.left,i.top,i.right,i.bottom);return WindowInsets.CONSUMED;
        });
    }
    private WebResourceResponse asset(Uri uri){
        String p=uri.getPath();
        if("https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && p!=null && !p.contains("..")){
            try{
                if(p.matches("/incoming/in-[a-zA-Z0-9-]+[.]tmp"))return new WebResourceResponse("application/octet-stream",null,new FileInputStream(new File(getCacheDir(),p.substring(10))));
                if(p.matches("/[a-zA-Z0-9._/-]+")){
                    String t=p.endsWith(".html")?"text/html":p.endsWith(".css")?"text/css":p.endsWith(".js")?"application/javascript":p.endsWith(".json")?"application/json":"application/octet-stream";
                    return new WebResourceResponse(t,p.endsWith(".xlsx")?null:"UTF-8",getAssets().open(p.substring(1)));
                }
            }catch(IOException ignored){}
        }
        return new WebResourceResponse("text/plain","UTF-8",404,"Missing",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    }
    private void cleanCache(){
        long cutoff=System.currentTimeMillis()-2*86400000L;
        File[] cached=getCacheDir().listFiles((d,n)->n.startsWith("in-")||n.startsWith("out-"));
        if(cached!=null)for(File f:cached)if(f.lastModified()<cutoff)f.delete();
        File[] shared=new File(getCacheDir(),"share").listFiles();
        if(shared!=null)for(File dir:shared)if(dir.lastModified()<cutoff){File[] fs=dir.listFiles();if(fs!=null)for(File f:fs)f.delete();dir.delete();}
    }
    private JSONArray queue(){try{return new JSONArray(getSharedPreferences("events",0).getString("pending","[]"));}catch(JSONException e){return new JSONArray();}}
    private void queue(JSONArray values){getSharedPreferences("events",0).edit().putString("pending",values.toString()).commit();}
    private synchronized void event(String type,String... fields){
        JSONObject obj=new JSONObject();try{obj.put("id",UUID.randomUUID().toString());obj.put("type",type);for(int i=0;i<fields.length;i+=2)obj.put(fields[i],fields[i+1]);}catch(JSONException e){return;}
        JSONArray q=queue();q.put(obj);queue(q);runOnUiThread(()->{if(!isDestroyed())web.evaluateJavascript("window.receivePhone && window.receivePhone()",null);});
    }
    public final class Bridge{
        @JavascriptInterface public String themePreference() {
            return appearance(Main.this).getString("theme","system");
        }
        @JavascriptInterface public boolean systemDarkTheme() {
            return systemDark(Main.this);
        }
        @JavascriptInterface public void setThemePreference(String preference) {
            if(!"system".equals(preference)&&!"light".equals(preference)&&!"dark".equals(preference))return;
            appearance(Main.this).edit().putString("theme",preference).apply();
            runOnUiThread(()->{if(!isDestroyed())applyAppearance();});
        }
        @JavascriptInterface public String pending(){synchronized(Main.this){JSONObject o=queue().optJSONObject(0);return o==null?"":o.toString();}}
        @JavascriptInterface public void ack(String id){synchronized(Main.this){
            JSONArray q=queue();JSONObject e=q.optJSONObject(0);if(e==null||!id.equals(e.optString("id")))return;
            q.remove(0);queue(q);String n=e.optString("token");if(n.matches("in-[a-zA-Z0-9-]+[.]tmp"))new File(getCacheDir(),n).delete();
        }}
        @JavascriptInterface public void open(){runOnUiThread(()->launch(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),OPEN));}
        @JavascriptInterface public void scan(String mode,String context){
            if(!mode.equals("ocr")&&!mode.equals("code"))return;
            runOnUiThread(()->{if(!external){scanContext=context;launch(new Intent(Main.this,Scanner.class).putExtra("mode",mode),SCAN);}});
        }
        @JavascriptInterface public boolean begin(String name,String kind){synchronized(fileLock){
            if(external || writer!=null || !kind.matches("xlsx|json"))return false;
            try{mime=kind.equals("xlsx")?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"application/json";
                fileName=name.replaceAll("[^a-zA-Zа-яА-ЯёЁ0-9 ._()-]","_");length=0;temp=File.createTempFile("out-",".tmp",getCacheDir());writer=new FileOutputStream(temp);return true;
            }catch(IOException e){discard();return false;}
        }}
        @JavascriptInterface public boolean chunk(String data){synchronized(fileLock){
            try{if(writer==null || data.length()>400000)return false;byte[] b=Base64.decode(data,Base64.DEFAULT);length+=b.length;if(length>64*MIB)return false;writer.write(b);return true;}
            catch(Exception e){return false;}
        }}
        @JavascriptInterface public void abort(){synchronized(fileLock){discard();}}
        @JavascriptInterface public boolean finishFile(boolean share){synchronized(fileLock){
            if(writer==null)return false;
            try{
                writer.close();writer=null;
                if(share){
                    File dir=new File(new File(getCacheDir(),"share"),UUID.randomUUID().toString());if(!dir.mkdirs())throw new IOException();
                    File to=new File(dir,fileName);if(!temp.renameTo(to))throw new IOException();temp=null;
                    Uri u=FileProvider.getUriForFile(Main.this,getPackageName()+".reports",to);
                    Intent send=new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,u).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    send.setClipData(ClipData.newRawUri(fileName,u));runOnUiThread(()->launch(Intent.createChooser(send,"Поделиться отчётом"),SHARE));
                }else runOnUiThread(()->launch(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,fileName),SAVE));
                return true;
            }catch(Exception e){discard();return false;}
        }}
    }
    private void discard(){if(writer!=null)try{writer.close();}catch(IOException ignored){}writer=null;if(temp!=null)temp.delete();temp=null;}
    private void launch(Intent i,int code){
        if(external)return;external=true;
        try{startActivityForResult(i,code);}catch(ActivityNotFoundException|SecurityException e){external=false;if(code==SAVE)discard();event("error","message","Android не смог открыть выбранное действие.");}
    }
    @Override protected void onSaveInstanceState(Bundle b){super.onSaveInstanceState(b);b.putString("context",scanContext);b.putString("name",fileName);b.putBoolean("external",external);if(temp!=null)b.putString("out",temp.getAbsolutePath());}
    @Override protected void onActivityResult(int req,int result,Intent data){
        super.onActivityResult(req,result,data);external=false;
        if(result!=RESULT_OK||data==null){if(req==SAVE)discard();return;}
        if(req==SCAN){event("scan","mode",data.getStringExtra("mode"),"text",data.getStringExtra("text"),"context",scanContext);return;}
        Uri u=data.getData();if(u==null)return;
        if(req==OPEN)io.execute(()->readFile(u));
        if(req==SAVE){
            final File src=temp;temp=null;final String name=fileName;
            io.execute(()->{try(InputStream in=new FileInputStream(src);OutputStream out=getContentResolver().openOutputStream(u,"wt")){
                if(out==null)throw new IOException();copy(in,out,64*MIB);
            }catch(Exception e){event("error","message","Не удалось записать файл. Выберите другую папку.");return;}finally{if(src!=null)src.delete();}
            event("saved","message","Сохранено: "+name);});
        }
    }
    private void readFile(Uri u){
        File incoming=null;
        try{
            String name="Ведомость";try(Cursor c=getContentResolver().query(u,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst()&&!c.isNull(0))name=c.getString(0);}
            incoming=File.createTempFile("in-",".tmp",getCacheDir());
            try(InputStream in=getContentResolver().openInputStream(u);OutputStream out=new FileOutputStream(incoming)){if(in==null)throw new IOException();copy(in,out,32*MIB);}
            event("file","name",name,"token",incoming.getName());
        }catch(Exception e){if(incoming!=null)incoming.delete();event("error","message",e instanceof TooLarge?"Файл превышает 32 МБ. Разделите ведомость.":"Не удалось прочитать файл.");}
    }
    static final class TooLarge extends IOException {}
    private static void copy(InputStream in,OutputStream out,int limit)throws IOException{int total=0,n;byte[] b=new byte[32768];while((n=in.read(b))!=-1){total+=n;if(total>limit)throw new TooLarge();out.write(b,0,n);}}
    @Override public void onBackPressed(){web.evaluateJavascript("!!(window.back && window.back())",v->{if(!"true".equals(v))super.onBackPressed();});}
    @Override protected void onDestroy(){synchronized(fileLock){if(writer!=null)discard();}io.shutdown();web.removeJavascriptInterface("Phone");web.destroy();super.onDestroy();}
}
