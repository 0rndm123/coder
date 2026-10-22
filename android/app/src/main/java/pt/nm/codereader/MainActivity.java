package pt.nm.codereader;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.graphics.Rect;
import android.view.Gravity;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.Preview;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.MeteringPoint;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.ZoomSuggestionOptions;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import org.json.JSONObject;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MainActivity extends AppCompatActivity {
    private static final int CAMERA_PERMISSION = 20;
    private static final int EXPORT_REQUEST = 21;
    private static final long SAME_CODE_COOLDOWN_MS = 2200;
    private final ExecutorService analysisExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean processing = new AtomicBoolean(false);
    private final BarcodeScanner scanner = BarcodeScanning.getClient(
        new BarcodeScannerOptions.Builder()
            .enableAllPotentialBarcodes()
            .setZoomSuggestionOptions(new ZoomSuggestionOptions.Builder(suggested -> {
                Camera c = camera;
                if (c == null || processing.get() == false) return false;
                androidx.camera.core.ZoomState state = c.getCameraInfo().getZoomState().getValue();
                if (state == null) return false;
                float bounded = Math.max(state.getMinZoomRatio(),
                    Math.min(Math.min(state.getMaxZoomRatio(), 3f), suggested));
                if (bounded < zoomRatio + 0.08f) return false;
                zoomRatio = bounded;
                c.getCameraControl().setZoomRatio(bounded);
                return true;
            }).setMaxSupportedZoomRatio(3f).build())
            .build());
    private PreviewView previewView;
    private TextView status;
    private TextView counter;
    private Button inButton;
    private Button outButton;
    private String movement = "entrada";
    private String lastKey = "";
    private long lastAcceptedAt = 0;
    private Camera camera;
    private float zoomRatio = 1f;
    private ScanStore store;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new ScanStore();
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(12, 16, 12, 12);
        root.setBackgroundColor(0xff101b28);
        previewView = new PreviewView(this);
        previewView.setImplementationMode(PreviewView.ImplementationMode.PERFORMANCE);
        root.addView(previewView, new LinearLayout.LayoutParams(-1, 0, 1f));
        LinearLayout controls = new LinearLayout(this);
        inButton = makeButton("ENTRADA", controls);
        outButton = makeButton("SAÍDA", controls);
        root.addView(controls);
        status = new TextView(this);
        status.setTextColor(0xffffffff);
        status.setTextSize(17);
        status.setPadding(8, 12, 8, 12);
        status.setText("A iniciar câmara…");
        root.addView(status);
        counter = new TextView(this);
        counter.setTextColor(0xffcce6ff);
        root.addView(counter);
        Button export = new Button(this);
        export.setText("Exportar registos TXT");
        export.setOnClickListener(v -> {
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TITLE, "code-reader.jsonl");
            startActivityForResult(i, EXPORT_REQUEST);
        });
        root.addView(export);
        setContentView(root);
        inButton.setOnClickListener(v -> setMovement("entrada"));
        outButton.setOnClickListener(v -> setMovement("saida"));
        setMovement("entrada");
        refreshCount();
        ScaleGestureDetector gestures = new ScaleGestureDetector(this,
            new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override public boolean onScale(ScaleGestureDetector detector) {
                    Camera c = camera;
                    if (c == null) return false;
                    androidx.camera.core.ZoomState state = c.getCameraInfo().getZoomState().getValue();
                    if (state == null) return false;
                    zoomRatio = Math.max(state.getMinZoomRatio(), Math.min(state.getMaxZoomRatio(),
                        zoomRatio * detector.getScaleFactor()));
                    c.getCameraControl().setZoomRatio(zoomRatio);
                    return true;
                }
            });
        previewView.setOnTouchListener((v, event) -> {
            gestures.onTouchEvent(event);
            if (event.getAction() == android.view.MotionEvent.ACTION_UP && !gestures.isInProgress()) {
                Camera c = camera;
                if (c != null && previewView.getWidth() > 0 && previewView.getHeight() > 0) {
                    MeteringPoint point = previewView.getMeteringPointFactory()
                        .createPoint(event.getX(), event.getY());
                    c.getCameraControl().startFocusAndMetering(
                        new FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF |
                            FocusMeteringAction.FLAG_AE).build());
                }
            }
            return true;
        });
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) startCamera();
        else requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
    }
    private Button makeButton(String label, LinearLayout parent) {
        Button button = new Button(this);
        button.setText(label);
        parent.addView(button, new LinearLayout.LayoutParams(0, -2, 1f));
        return button;
    }
    private void setMovement(String value) {
        movement = value;
        inButton.setAlpha("entrada".equals(value) ? 1f : 0.55f);
        outButton.setAlpha("saida".equals(value) ? 1f : 0.55f);
        status.setText("Leitura contínua · " + value.toUpperCase() + " · aproxime o código");
    }
    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                ProcessCameraProvider provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                // Request a high-detail ~2 MP analysis frame; CameraX adapts to
                // the supported sizes of each manufacturer's camera hardware.
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setTargetResolution(new android.util.Size(1920, 1080))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
                    .build();
                analysis.setAnalyzer(analysisExecutor, imageProxy -> {
                    if (!processing.compareAndSet(false, true)) {
                        imageProxy.close();
                        return;
                    }
                    android.media.Image frame = imageProxy.getImage();
                    if (frame == null) {
                        processing.set(false);
                        imageProxy.close();
                        return;
                    }
                    InputImage image = InputImage.fromMediaImage(frame, imageProxy.getImageInfo().getRotationDegrees());
                    scanner.process(image)
                        .addOnSuccessListener(barcodes -> {
                            for (Barcode barcode : barcodes) {
                                String value = barcode.getRawValue();
                                if (value != null && !value.isEmpty()) {
                                    accept(value, barcode.getFormat());
                                    break;
                                }
                            }
                        })
                        .addOnFailureListener(e -> android.util.Log.w("CodeReader", "Decode failed", e))
                        .addOnCompleteListener(task -> {
                            imageProxy.close();
                            processing.set(false);
                        });
                });
                provider.unbindAll();
                camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
                zoomRatio = 1f;
            } catch (Exception e) {
                status.setText("Erro na câmara: " + e.getClass().getSimpleName());
            }
        }, ContextCompat.getMainExecutor(this));
    }
    private void accept(String value, int format) {
        long now = SystemClock.elapsedRealtime();
        String key = movement + "|" + format + "|" + value;
        if (key.equals(lastKey) && now - lastAcceptedAt < SAME_CODE_COOLDOWN_MS) return;
        lastKey = key;
        lastAcceptedAt = now;
        try {
            store.insert(value, format, movement);
            status.setText("Registado: " + value);
            refreshCount();
            Vibrator vib = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vib != null && vib.hasVibrator())
                vib.vibrate(VibrationEffect.createOneShot(70, VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (Exception e) {
            status.setText("Erro ao guardar registo");
            android.util.Log.e("CodeReader", "Storage failed", e);
        }
    }
    private void refreshCount() { counter.setText("Registos neste dispositivo: " + store.count()); }
    @Override public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                                       @NonNull int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == CAMERA_PERMISSION) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startCamera();
            else status.setText("Autorize a utilização da câmara nas definições Android.");
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != EXPORT_REQUEST || resultCode != RESULT_OK || data == null) return;
        Uri uri = data.getData();
        if (uri == null) return;
        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IllegalStateException("Sem acesso ao ficheiro");
            store.export(out);
            status.setText("Registos exportados.");
        } catch (Exception e) { status.setText("Falha na exportação: " + e.getMessage()); }
    }
    @Override protected void onDestroy() {
        super.onDestroy();
        scanner.close();
        analysisExecutor.shutdown();
        store.close();
    }
    private final class ScanStore extends SQLiteOpenHelper {
        ScanStore() { super(MainActivity.this, "scans.db", null, 1); }
        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE scans (id TEXT PRIMARY KEY, scanned_at TEXT NOT NULL, " +
                "format TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL, movement TEXT NOT NULL)");
        }
        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }
        String formatName(int format) {
            switch (format) {
                case Barcode.FORMAT_QR_CODE: return "QR_CODE";
                case Barcode.FORMAT_DATA_MATRIX: return "DATA_MATRIX";
                case Barcode.FORMAT_EAN_13: return "EAN_13";
                case Barcode.FORMAT_EAN_8: return "EAN_8";
                case Barcode.FORMAT_CODE_128: return "CODE_128";
                case Barcode.FORMAT_CODE_39: return "CODE_39";
                case Barcode.FORMAT_CODE_93: return "CODE_93";
                case Barcode.FORMAT_UPC_A: return "UPC_A";
                case Barcode.FORMAT_UPC_E: return "UPC_E";
                case Barcode.FORMAT_ITF: return "ITF";
                case Barcode.FORMAT_CODABAR: return "CODABAR";
                case Barcode.FORMAT_PDF417: return "PDF_417";
                case Barcode.FORMAT_AZTEC: return "AZTEC";
                default: return "DESCONHECIDO";
            }
        }
        void insert(String value, int format, String movement) {
            ContentValues values = new ContentValues();
            values.put("id", UUID.randomUUID().toString());
            SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
            formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
            values.put("scanned_at", formatter.format(new Date()));
            values.put("format", formatName(format));
            values.put("value", value);
            values.put("source", "camera");
            values.put("movement", movement);
            if (getWritableDatabase().insertOrThrow("scans", null, values) == -1)
                throw new IllegalStateException("Não foi possível guardar");
        }
        int count() {
            try (Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM scans", null)) {
                return c.moveToFirst() ? c.getInt(0) : 0;
            }
        }
        void export(OutputStream out) throws Exception {
            try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT id,scanned_at,format,value,source,movement FROM scans ORDER BY scanned_at,id", null)) {
                while (c.moveToNext()) {
                    JSONObject record = new JSONObject();
                    for (int i = 0; i < c.getColumnCount(); i++)
                        record.put(c.getColumnName(i), c.getString(i));
                    out.write((record.toString() + "\n").getBytes(StandardCharsets.UTF_8));
                }
            }
        }
    }
}
