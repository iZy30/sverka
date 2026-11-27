package ru.it.inventory;

import android.Manifest;
import android.app.AlertDialog;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.*;
import android.util.Size;
import android.view.*;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.camera.core.*;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.*;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.*;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public final class Scanner extends ComponentActivity {
    private static final int GREEN=0xff203e31,LIME=0xffc7e990;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicBoolean reading=new AtomicBoolean();
    private volatile boolean photo,snap,leaving;
    private boolean ocr,torch;
    private PreviewView preview;private TextView message;private Button light,shutter;
    private ProcessCameraProvider provider;private androidx.camera.core.Camera camera;
    private BarcodeScanner decoder;private TextRecognizer text;
    private long last;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        ocr="ocr".equals(getIntent().getStringExtra("mode"));
        if(ocr)text=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);else decoder=BarcodeScanning.getClient();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);getWindow().setStatusBarColor(GREEN);getWindow().getDecorView().setSystemUiVisibility(0);
        LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(GREEN);setContentView(root);Main.insets(root);
        LinearLayout top=bar();Button back=button("Назад",false);back.setOnClickListener(v->finish());top.addView(back);
        TextView title=label(ocr?"Серийный номер":"Штрихкод / QR",20);title.setGravity(Gravity.CENTER_VERTICAL|Gravity.RIGHT);title.setTypeface(Typeface.DEFAULT,1);
        top.addView(title,new LinearLayout.LayoutParams(0,-1,1));root.addView(top);
        FrameLayout box=new FrameLayout(this);preview=new PreviewView(this);preview.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);box.addView(preview);box.addView(new Target());root.addView(box,new LinearLayout.LayoutParams(-1,0,1));
        preview.setOnTouchListener((v,e)->{if(e.getAction()==MotionEvent.ACTION_UP && camera!=null){MeteringPoint p=preview.getMeteringPointFactory().createPoint(e.getX(),e.getY());camera.getCameraControl().startFocusAndMetering(new FocusMeteringAction.Builder(p).setAutoCancelDuration(3,TimeUnit.SECONDS).build());v.performClick();}return true;});
        message=label(ocr?"Наведите камеру на надпись S/N и нажмите «Считать».":"Наведите камеру на штрихкод или QR-код.",15);message.setPadding(dp(15),dp(13),dp(15),0);root.addView(message);
        LinearLayout actions=bar();Button gallery=button("Из фото",false);gallery.setOnClickListener(v->pick());actions.addView(gallery);
        light=button("Фонарик",false);light.setEnabled(false);light.setOnClickListener(v->{if(camera!=null){torch=!torch;camera.getCameraControl().enableTorch(torch);light.setText(torch?"Выключить":"Фонарик");}});actions.addView(light);
        if(ocr){shutter=button("Считать",true);shutter.setEnabled(false);shutter.setOnClickListener(v->{snap=true;shutter.setEnabled(false);message.setText("Распознавание…");});actions.addView(shutter,new LinearLayout.LayoutParams(0,dp(48),1));}
        root.addView(actions);
        if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)startCamera();else requestPermissions(new String[]{Manifest.permission.CAMERA},21);
    }
    @Override public void onRequestPermissionsResult(int id,String[] permissions,int[] grants){super.onRequestPermissionsResult(id,permissions,grants);if(id==21 && grants.length>0 && grants[0]==0)startCamera();else message.setText("Можно выбрать готовое фото. Для съёмки разрешите камеру в настройках приложения.");}
    private void startCamera(){
        ListenableFuture<ProcessCameraProvider> future=ProcessCameraProvider.getInstance(this);
        future.addListener(()->{if(isDestroyed()||isFinishing())return;
            try{provider=future.get();CameraSelector lens=provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)?CameraSelector.DEFAULT_BACK_CAMERA:CameraSelector.DEFAULT_FRONT_CAMERA;
                Preview view=new Preview.Builder().build();view.setSurfaceProvider(preview.getSurfaceProvider());
                ImageAnalysis frames=new ImageAnalysis.Builder().setTargetResolution(new Size(1600,1200)).setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();
                frames.setAnalyzer(worker,this::frame);camera=provider.bindToLifecycle(this,lens,view,frames);
                light.setEnabled(camera.getCameraInfo().hasFlashUnit());if(shutter!=null)shutter.setEnabled(true);
            }catch(Exception e){message.setText("Камера недоступна. Выберите снимок через «Из фото».");}
        },ContextCompat.getMainExecutor(this));
    }
    @androidx.camera.core.ExperimentalGetImage private void frame(ImageProxy f){
        long now=SystemClock.elapsedRealtime();android.media.Image img=f.getImage();
        if(img==null||leaving||photo||(ocr&&!snap)||(!ocr&&now-last<170)||!reading.compareAndSet(false,true)){f.close();return;}
        last=now;snap=false;
        try{recognize(InputImage.fromMediaImage(img,f.getImageInfo().getRotationDegrees()),false,f::close);}
        catch(RuntimeException e){f.close();reading.set(false);runOnUiThread(this::again);}
    }
    private boolean active(boolean still){return !leaving&&!isFinishing()&&!isDestroyed()&&(still||!photo);}
    private void recognize(InputImage img,boolean still,Runnable release){
        Runnable done=()->{release.run();if(still)photo=false;else reading.set(false);if(shutter!=null&&camera!=null)shutter.setEnabled(true);};
        if(ocr)text.process(img).addOnSuccessListener(r->{if(!active(still))return;String t=r.getText().trim();if(t.isEmpty())again();else deliver(t);})
            .addOnFailureListener(e->{if(active(still))again();}).addOnCompleteListener(t->done.run());
        else decoder.process(img).addOnSuccessListener(r->{if(!active(still))return;LinkedHashSet<String> codes=new LinkedHashSet<>();
            for(Barcode b:r)if(b.getRawValue()!=null&&!b.getRawValue().trim().isEmpty())codes.add(b.getRawValue());
            if(codes.size()==1)deliver(codes.iterator().next());
            else if(codes.size()>1){leaving=true;String[] values=codes.toArray(new String[0]);new AlertDialog.Builder(this).setTitle("Выберите код").setItems(values,(d,i)->deliver(values[i])).setNegativeButton("Ещё раз",(d,i)->leaving=false).setOnCancelListener(d->leaving=false).show();}
            else if(still)again();
        }).addOnFailureListener(e->{if(active(still))again();}).addOnCompleteListener(t->done.run());
    }
    private void again(){message.setText("Не удалось прочитать этикетку. Проверьте резкость и освещение или выберите другой снимок.");if(shutter!=null&&camera!=null)shutter.setEnabled(true);}
    private void deliver(String s){if(isFinishing()||isDestroyed())return;leaving=true;setResult(RESULT_OK,new Intent().putExtra("mode",ocr?"ocr":"code").putExtra("text",s.substring(0,Math.min(s.length(),24000))));finish();}
    private void pick(){if(photo||leaving)return;photo=true;try{startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE),22);}catch(ActivityNotFoundException e){photo=false;again();}}
    @Override protected void onActivityResult(int id,int result,Intent data){super.onActivityResult(id,result,data);if(id!=22)return;
        if(result!=RESULT_OK||data==null||data.getData()==null){photo=false;return;}
        photo=true;Uri uri=data.getData();message.setText("Распознавание снимка…");
        worker.execute(()->{try{Bitmap img=bitmap(uri);runOnUiThread(()->{if(isDestroyed()||isFinishing())img.recycle();else recognize(InputImage.fromBitmap(img,0),true,img::recycle);});}
            catch(Exception e){runOnUiThread(()->{photo=false;again();});}});
    }
    private Bitmap bitmap(Uri u)throws IOException{
        BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;try(InputStream in=getContentResolver().openInputStream(u)){BitmapFactory.decodeStream(in,null,o);}
        if(o.outWidth<=0||o.outHeight<=0)throw new IOException();o.inSampleSize=1;o.inJustDecodeBounds=false;while(Math.max(o.outWidth,o.outHeight)/o.inSampleSize>3000)o.inSampleSize*=2;
        Bitmap img;try(InputStream in=getContentResolver().openInputStream(u)){img=BitmapFactory.decodeStream(in,null,o);}if(img==null)throw new IOException();
        int ex=1;try(InputStream in=getContentResolver().openInputStream(u)){if(in!=null)ex=new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION,1);}catch(IOException ignored){}
        Matrix m=new Matrix();if(ex==2||ex==4||ex==5||ex==7)m.postScale(-1,1);if(ex==3||ex==4)m.postRotate(180);if(ex==5||ex==6)m.postRotate(90);if(ex==7||ex==8)m.postRotate(270);
        if(m.isIdentity())return img;Bitmap rotated=Bitmap.createBitmap(img,0,0,img.getWidth(),img.getHeight(),m,true);if(rotated!=img)img.recycle();return rotated;
    }
    int dp(int x){return Math.round(getResources().getDisplayMetrics().density*x);}
    TextView label(String s,int size){TextView t=new TextView(this);t.setText(s);t.setTextColor(0xfff5f7ee);t.setTextSize(size);return t;}
    Button button(String s,boolean primary){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextSize(14);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(dp(48));b.setPadding(dp(12),0,dp(12),0);b.setTextColor(primary?GREEN:0xfff4f8ef);
        android.graphics.drawable.GradientDrawable g=new android.graphics.drawable.GradientDrawable();g.setCornerRadius(dp(9));g.setColor(primary?LIME:0xff355341);b.setBackground(new android.graphics.drawable.InsetDrawable(g,dp(2)));return b;}
    LinearLayout bar(){LinearLayout b=new LinearLayout(this);b.setGravity(Gravity.CENTER_VERTICAL);b.setPadding(dp(10),dp(8),dp(10),dp(8));return b;}
    final class Target extends View{final Paint paint=new Paint(1);Target(){super(Scanner.this);setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);}
        @Override protected void onDraw(Canvas c){float w=getWidth(),h=getHeight(),rw=w*.84f,rh=Math.min(h*.55f,rw*(ocr?.43f:.75f)),x=(w-rw)/2,y=(h-rh)/2,r=x+rw,b=y+rh,n=dp(24);
            paint.setColor(0x55000000);c.drawRect(0,0,w,y,paint);c.drawRect(0,b,w,h,paint);c.drawRect(0,y,x,b,paint);c.drawRect(r,y,w,b,paint);
            paint.setColor(LIME);paint.setStrokeWidth(dp(3));c.drawLines(new float[]{x,y+n,x,y,x,y,x+n,y,r-n,y,r,y,r,y,r,y+n,x,b-n,x,b,x,b,x+n,b,r-n,b,r,b,r,b,r,b-n},paint);}}
    @Override protected void onDestroy(){leaving=true;if(provider!=null)provider.unbindAll();if(decoder!=null)decoder.close();if(text!=null)text.close();worker.shutdown();super.onDestroy();}
}
