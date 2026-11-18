package br.com.esporte.bilheteria.smart;

import android.graphics.Bitmap;
import android.os.*;
import android.view.View;
import android.widget.*;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.Executor;
import org.json.JSONObject;

final class SicrediPixView {
    interface Listener { void closed(String status); void loginRequired(); }
    private final CounterApi api;
    private final String key;
    private final TextView status;
    private final ImageView qr;
    private final Executor executor;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int generation;
    private boolean visible;
    private String shown = "";
    private final Runnable expire = this::expired;
    SicrediPixView(CounterApi api, String key, TextView status, ImageView qr, Executor executor, Listener listener) {
        this.api = api; this.key = key; this.status = status; this.qr = qr; this.executor = executor; this.listener = listener;
    }
    void start() {
        if (visible) return;
        visible = true; status.setText("Consultando Pix Sicredi…"); poll();
    }
    void stop() {
        visible = false; generation++;
        handler.removeCallbacksAndMessages(null); hideCode();
    }
    private void hideCode() { shown = ""; qr.setImageDrawable(null); qr.setVisibility(View.GONE); }
    private void expired() { hideCode(); status.setText("Prazo encerrado. Consultando o pedido…"); }
    private void poll() {
        if (!visible) return;
        int current = generation;
        String displayed = shown;
        long started = SystemClock.elapsedRealtime();
        executor.execute(() -> {
            try {
                JSONObject order = api.receipt(key);
                String payment = order.getString("statusPagamento");
                if (!payment.equals("PENDENTE")) {
                    handler.post(() -> { if (current == generation && visible) listener.closed(payment); });
                    return;
                }
                JSONObject intent = api.pix(key);
                String payload = "sicredi".equals(intent.optString("provider")) && "PENDING".equals(intent.optString("state"))
                    && !intent.isNull("pixPayload") ? intent.getString("pixPayload") : "";
                long remaining = payload.isEmpty() ? 0 : timestamp(intent.getString("expiresAt")) - timestamp(intent.getString("serverTime"));
                Bitmap bitmap = payload.isEmpty() || payload.equals(displayed) || remaining <= 0 ? null : draw(payload);
                handler.post(() -> {
                    if (!visible || current != generation) return;
                    long ttl = remaining - (SystemClock.elapsedRealtime() - started);
                    handler.removeCallbacks(expire);
                    if (payload.isEmpty() || ttl <= 0 || (bitmap == null && !payload.equals(shown))) {
                        hideCode();
                        status.setText(intent.isNull("failureCode") ? "Aguardando o Sicredi…" : "Pix indisponível. Aguardando atualização.");
                    } else {
                        if (bitmap != null) qr.setImageBitmap(bitmap);
                        shown = payload; qr.setVisibility(View.VISIBLE); status.setText("Escaneie com o app do banco.");
                        handler.postDelayed(expire, ttl);
                    }
                    handler.postDelayed(this::poll, 4000);
                });
            } catch (Exception e) {
                handler.post(() -> {
                    if (!visible || current != generation) return;
                    hideCode();
                    if (e instanceof CounterApi.Failure && ((CounterApi.Failure)e).status == 401) { listener.loginRequired(); return; }
                    status.setText("Não foi possível consultar o Pix. Tentando novamente…");
                    handler.postDelayed(this::poll, 5000);
                });
            }
        });
    }
    private static long timestamp(String value) throws Exception {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC")); return fmt.parse(value).getTime();
    }
    private static Bitmap draw(String payload) throws Exception {
        BitMatrix code = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 384, 384);
        int size = code.getWidth(); int[] pixels = new int[size * size];
        for (int y=0; y<size; y++) for (int x=0; x<size; x++) pixels[y * size + x] = code.get(x,y) ? 0xff000000 : 0xffffffff;
        return Bitmap.createBitmap(pixels,size,size,Bitmap.Config.ARGB_8888);
    }
}
