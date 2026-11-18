package br.com.esporte.bilheteria.smart;

import android.app.*;
import android.os.Bundle;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import java.text.NumberFormat;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;
import br.com.uol.pagseguro.plugpagservice.wrapper.*;
import static br.com.esporte.bilheteria.smart.CounterApi.obj;

public final class CounterActivity extends Activity {
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static PlugPag plug;
    private final CounterApi api = new CounterApi();
    private TerminalStore store;
    private LinearLayout content;
    private TextView notice;
    private String printableKey;
    private SicrediPixView pixView;
    private boolean foreground;
    private boolean busy;
    private interface Work { void run() throws Exception; }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        store = new TerminalStore(this);
        if (plug == null) plug = new PlugPag(getApplicationContext());
        login();
    }
    private String money(int cents) { return NumberFormat.getCurrencyInstance(new Locale("pt","BR")).format(cents / 100.0); }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private void page(String title) {
        if (pixView != null) { pixView.stop(); pixView = null; }
        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(18),dp(16),dp(18),dp(20));
        scroll.addView(content); setContentView(scroll);
        TextView h = line(title); h.setTextSize(24); h.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        notice = line(""); notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    }
    private TextView line(String text) {
        TextView v = new TextView(this); v.setText(text); v.setTextSize(16); v.setTextColor(0xff352a2a);
        v.setPadding(0,dp(3),0,dp(4)); content.addView(v); return v;
    }
    private EditText field(String hint, int type) {
        EditText f = new EditText(this); f.setSingleLine(); f.setHint(hint); f.setInputType(type); content.addView(f); return f;
    }
    private void button(String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setAllCaps(false); b.setTextColor(0xff921c29); content.addView(b);
        b.setOnClickListener(v -> { if (!busy) action.run(); });
    }
    private void ui(Runnable next) { runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) next.run(); }); }
    private void work(String label, Work task) {
        if (busy) return;
        busy = true; notice.setText(label);
        worker.submit(() -> {
            try { task.run(); }
            catch (Exception e) { ui(() -> {
                if (e instanceof CounterApi.Failure && ((CounterApi.Failure)e).status == 401) login();
                else if (!api.seller.isEmpty()) home();
                notice.setText(e.getMessage() == null ? "Confira a operação antes de repetir." : e.getMessage());
            }); }
            finally { ui(() -> busy = false); }
        });
    }
    @Override public void onBackPressed() {
        if (!busy) { if (api.seller.isEmpty()) super.onBackPressed(); else home(); }
    }
    @Override protected void onResume() { super.onResume(); foreground = true; if (pixView != null) pixView.start(); }
    @Override protected void onPause() { foreground = false; if (pixView != null) pixView.stop(); super.onPause(); }
    private void login() {
        printableKey = null;
        page("Bilheteria Esporte");
        EditText email = field("E-mail do vendedor", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = field("Senha", 129);
        EditText key = field(store.provisioned() ? "Nova chave da maquineta (opcional)" : "Chave da maquineta", 129);
        button("Entrar na Moderninha", () -> {
            String account = email.getText().toString().trim(), secret = password.getText().toString(), provision = key.getText().toString().trim();
            work("Conectando…", () -> {
                String token = provision.isEmpty() && store.provisioned() ? store.readKey() : provision;
                if (token.isEmpty()) throw new Exception("Informe a chave de habilitação da bilheteria.");
                api.login(account, secret, token);
                JSONArray queue;
                try { queue = (JSONArray)api.terminal(null); }
                catch (Exception error) { api.logout(); throw error; }
                if (!provision.isEmpty()) store.provision(token);
                ui(() -> showQueue(queue));
            });
        });
    }
    private void home() {
        page("Pagamentos do vendedor");
        button("Nova venda", () -> work("Consultando jogos e lotes…", () -> {
            if (store.pending() != null) { reload(); return; }
            JSONArray lots = api.lots(); ui(() -> showLots(lots));
        }));
        button("Consultar pedidos", () -> work("Carregando…", this::reload));
        if (printableKey != null) button("Imprimir ingressos da última venda", () -> work("Imprimindo ingressos…", () -> {
            TicketPrinter.print(getCacheDir(), plug, api.tickets(printableKey).getString("base64"));
            ui(() -> notice.setText("Ingressos impressos."));
        }));
        button("Sair", this::logout);
    }
    private void logout() { work("Encerrando sessão…", () -> { api.logout(); ui(() -> { printableKey = null; login(); }); }); }
    private void reload() throws Exception {
        JSONArray rows = (JSONArray)api.terminal(null);
        ui(() -> showQueue(rows));
    }
    private void showQueue(JSONArray rows) {
        home();
        try {
            JSONObject saved = store.pending();
            if (saved != null) {
                if (!api.seller.equals(saved.getString("seller"))) { notice.setText("Há uma operação neste terminal. Entre com a conta que iniciou a cobrança."); return; }
                showPending(saved); return;
            }
            notice.setText(rows.length() == 0 ? "Nenhum pedido aguardando cobrança." : "Selecione o pedido do balcão.");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject order = rows.getJSONObject(i);
                String label = orderLabel(order);
                String match = matchLabel(order.getJSONObject("partida"));
                boolean pix = "PIX".equals(order.getString("metodoBalcao"));
                if (order.isNull("expiraEm")) line(label + " · em processamento"); else button(label + (pix ? " · Pix Sicredi · " : " · Cartão · ") + match, () -> select(order, label, match));
            }
        } catch (Exception e) { notice.setText("Falha ao carregar a operação. Consulte novamente."); }
    }
    private String orderLabel(JSONObject order) {
        String id = order.optString("id");
        return id.substring(Math.max(0,id.length()-6)) + " · " + money(order.optInt("valorTotalCentavos"));
    }
    private String matchLabel(JSONObject match) {
        String date = match.optString("dataPartida");
        String kickoff = "";
        if (!date.isEmpty()) try {
            java.text.SimpleDateFormat iso = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            iso.setTimeZone(TimeZone.getTimeZone("UTC"));
            java.text.SimpleDateFormat local = new java.text.SimpleDateFormat("dd/MM HH:mm", new Locale("pt","BR"));
            local.setTimeZone(TimeZone.getTimeZone("America/Fortaleza"));
            kickoff = " · " + local.format(iso.parse(date));
        } catch (java.text.ParseException ignored) {}
        return match.optString("timeMandante") + " × " + match.optString("timeVisitante") + kickoff;
    }
    private void showLots(JSONArray lots) {
        page("Escolher jogo e setor");
        if (lots.length() == 0) notice.setText("Nenhum lote à venda.");
        String lastMatch = "";
        for (int i = 0; i < lots.length(); i++) {
            JSONObject lot = lots.optJSONObject(i), match = lot.optJSONObject("match");
            if (!match.optString("id").equals(lastMatch)) { line(matchLabel(match)); lastMatch = match.optString("id"); }
            String label = lot.optJSONObject("sector").optString("nome") + " · " + lot.optString("name") + " · " + money(lot.optInt("unitCents"));
            button(label, () -> saleForm(lot, label));
        }
        button("Voltar", this::home);
    }
    private void saleForm(JSONObject lot, String label) {
        page("Nova venda"); line(matchLabel(lot.optJSONObject("match"))); line(label);
        EditText cpf = field("CPF do comprador", InputType.TYPE_CLASS_NUMBER);
        cpf.setKeyListener(android.text.method.DigitsKeyListener.getInstance("0123456789.-"));
        cpf.setRawInputType(InputType.TYPE_CLASS_NUMBER);
        cpf.addTextChangedListener(new android.text.TextWatcher() {
            private boolean updating;
            public void beforeTextChanged(CharSequence s,int start,int count,int after) {}
            public void onTextChanged(CharSequence s,int start,int before,int count) {}
            public void afterTextChanged(android.text.Editable s) {
                if (updating) return;
                String digits = s.toString().replaceAll("[^0-9]", "");
                StringBuilder masked = new StringBuilder();
                for (int i=0; i<Math.min(11,digits.length()); i++) {
                    if (i == 3 || i == 6) masked.append('.');
                    if (i == 9) masked.append('-');
                    masked.append(digits.charAt(i));
                }
                if (!masked.toString().contentEquals(s)) {
                    updating = true; s.replace(0, s.length(), masked); cpf.setSelection(s.length()); updating = false;
                }
            }
        });
        line("Quantidade de ingressos");
        NumberPicker quantity = new NumberPicker(this);
        quantity.setMinValue(1); quantity.setMaxValue(Math.min(10,lot.optInt("available")));
        quantity.setWrapSelectorWheel(false); quantity.setDescendantFocusability(NumberPicker.FOCUS_BLOCK_DESCENDANTS); content.addView(quantity);
        boolean seated = lot.optJSONObject("sector").optBoolean("numerado");
        EditText block = seated ? field("Bloco", InputType.TYPE_CLASS_NUMBER) : null;
        EditText row = seated ? field("Fileira", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS) : null;
        EditText first = seated ? field("Primeiro assento", InputType.TYPE_CLASS_NUMBER) : null;
        TextView total = line("Total " + money(lot.optInt("unitCents")));
        quantity.setOnValueChangedListener((picker,oldValue,value) -> total.setText("Total " + money(value * lot.optInt("unitCents"))));
        line("Forma de pagamento");
        RadioGroup methods = new RadioGroup(this);
        RadioButton card = new RadioButton(this); card.setText("Cartão na Moderninha"); card.setId(View.generateViewId()); methods.addView(card);
        RadioButton pix = new RadioButton(this); pix.setText("Pix Sicredi"); pix.setId(View.generateViewId());
        if (lot.optBoolean("pixAvailable", true) && lot.optInt("unitCents") > 0) methods.addView(pix);
        methods.check(card.getId()); content.addView(methods);
        button("Reservar para cobrar", () -> {
            try {
                String document = cpf.getText().toString().replaceAll("[^0-9]", "");
                if (!document.matches("[0-9]{11}")) { cpf.setError("Informe os 11 dígitos do CPF."); return; }
                JSONObject input = obj("key",UUID.randomUUID().toString(),"cpf",document,"lotId",lot.getString("id"),
                    "unitCents",lot.getInt("unitCents"),"quantity",quantity.getValue(),"method",pix.isChecked() ? "PIX" : "PAGBANK");
                if (seated) input.put("seat", obj("block",Integer.parseInt(block.getText().toString()),
                    "row",row.getText().toString().trim().toUpperCase(Locale.ROOT),"first",Integer.parseInt(first.getText().toString())));
                work("Reservando…", () -> {
                    if (store.pending() != null) { reload(); return; }
                    JSONObject record = obj("phase","reserve","seller",api.seller,"draft",store.protectDraft(input));
                    store.save(record); reserve(record);
                });
            } catch (Exception e) { notice.setText("Confira o bloco, a fileira e o assento."); }
        });
        button("Voltar", this::home);
    }
    private void reserve(JSONObject record) throws Exception {
        JSONObject order;
        try { order = api.reserve(store.readDraft(record.getJSONObject("draft"))); }
        catch (CounterApi.Failure e) { if (e.status == 409 || e.status == 422 || "SICREDI_DISABLED".equals(e.code)) store.save(null); throw e; }
        store.save(null);
        if (!"PENDENTE".equals(order.optString("statusPagamento")) || order.isNull("expiraEm")) { reload(); return; }
        ui(() -> select(order, orderLabel(order), matchLabel(order.optJSONObject("partida"))));
    }
    private void select(JSONObject order, String label, String match) {
        page(label); line(match);
        if ("PIX".equals(order.optString("metodoBalcao"))) {
            line("Pix Sicredi");
            String key = order.optString("chaveBalcao");
            ImageView qr = new ImageView(this); qr.setContentDescription("QR do Pix Sicredi"); qr.setVisibility(View.GONE);
            content.addView(qr, -1, dp(240));
            pixView = new SicrediPixView(api, key, notice, qr, worker, new SicrediPixView.Listener() {
                public void closed(String status) {
                    boolean paid = "PAGO".equals(status);
                    printableKey = paid ? key : null; home();
                    notice.setText(paid ? "Pix confirmado. Ingressos disponíveis para impressão." : "Reserva encerrada · " + status);
                }
                public void loginRequired() { login(); }
            });
            if (foreground) pixView.start();
        } else {
            button("Débito", () -> begin(order, PlugPag.TYPE_DEBITO));
            button("Crédito à vista", () -> begin(order, PlugPag.TYPE_CREDITO));
        }
        button("Voltar", this::home);
    }
    private void begin(JSONObject order, int type) {
        work("Preparando a cobrança…", () -> {
            if (store.pending() != null) throw new Exception("Consulte a operação em andamento.");
            JSONObject record = obj("key",order.getString("chaveBalcao"), "attempt",UUID.randomUUID().toString(),
                "seller",api.seller, "amount",order.getInt("valorTotalCentavos"), "type",type, "phase","claim");
            store.save(record);
            charge(record);
        });
    }
    private JSONObject command(JSONObject record, String action) throws JSONException {
        return obj("key",record.getString("key"), "attempt",record.getString("attempt"), "action",action);
    }
    private void charge(JSONObject r) throws Exception {
        if (!plug.isAuthenticated() || plug.isServiceBusy()) throw new Exception("Confira a ativação e aguarde a maquineta ficar disponível.");
        JSONObject claim;
        try { claim = (JSONObject)api.terminal(command(r,"begin")); }
        catch (CounterApi.Failure e) { if (e.status == 404 || e.status == 409) store.save(null); throw e; }
        if (claim.getInt("amountCents") != r.getInt("amount")) throw new Exception("Valor divergente. Confira o pedido.");
        r.put("reference",claim.getString("reference"));
        PlugPagPaymentData data = new PlugPagPaymentData(r.getInt("type"), r.getInt("amount"), PlugPag.INSTALLMENT_TYPE_A_VISTA,
            PlugPag.A_VISTA_INSTALLMENT_QUANTITY, r.getString("reference"), true);
        plug.setEventListener(event -> {
            String prompt;
            switch (event.getEventCode()) {
                case PlugPagEventData.EVENT_CODE_WAITING_CARD: prompt = "Aproxime ou insira o cartão."; break;
                case PlugPagEventData.EVENT_CODE_PIN_REQUESTED: prompt = "Digite a senha no teclado da Moderninha."; break;
                case PlugPagEventData.EVENT_CODE_WAITING_REMOVE_CARD: prompt = "Retire o cartão."; break;
                default: return;
            }
            ui(() -> notice.setText(prompt));
        });
        PlugPagTransactionResult result;
        try {
            r.put("phase","processing"); store.save(r);
            result = plug.doPayment(data);
        } finally { plug.setEventListener(event -> {}); }
        if (Integer.valueOf(PlugPag.RET_OK).equals(result.getResult())) accept(r, result);
        else if (Arrays.asList("A001","A004","A202","A209","A242","S99","S899").contains(result.getErrorCode())) {
            decline(r, result.getErrorCode());
        } else throw new Exception("Retorno inconclusivo. Consulte a última aprovação e o extrato da Moderninha.");
    }
    private void accept(JSONObject r, PlugPagTransactionResult result) throws Exception {
        if (!Integer.valueOf(PlugPag.RET_OK).equals(result.getResult()) || !r.getString("reference").equals(result.getUserReference())
            || !matchesAmount(result.getAmount(), r.getInt("amount"))
            || result.getTransactionCode() == null || result.getTransactionCode().isEmpty())
            throw new Exception("A última aprovação não corresponde ao pedido. Confira o extrato antes de liberar a reserva.");
        r.put("phase","approved"); r.put("transaction", result.getTransactionCode()); store.save(r); finishResult(r);
    }
    private static boolean matchesAmount(String raw, int cents) {
        if (raw == null) return false;
        if (raw.matches("[0-9]{1,12}")) return Long.parseLong(raw) == cents;
        if (!raw.matches("[0-9]{1,10}[.,][0-9]{2}")) return false;
        return new java.math.BigDecimal(raw.replace(',', '.')).movePointRight(2).longValueExact() == cents;
    }
    private void decline(JSONObject r, String reason) throws Exception {
        r.put("phase","declined"); r.put("reason",reason); store.save(r); finishResult(r);
    }
    private void finishResult(JSONObject r) throws Exception {
        String phase = r.getString("phase");
        JSONObject body = command(r,phase);
        if (phase.equals("approved")) {
            body.put("transaction",r.getString("transaction")); body.put("reference",r.getString("reference")); body.put("amountCents",r.getInt("amount"));
        } else body.put("reason",r.getString("reason"));
        api.terminal(body);
        store.save(null);
        ui(() -> { printableKey = phase.equals("approved") ? r.optString("key") : null; home(); notice.setText(phase.equals("approved") ? "Pagamento aprovado. Os ingressos já podem ser impressos." : "Cobrança encerrada. Reserva liberada."); });
    }
    private void showPending(JSONObject r) throws Exception {
        String phase = r.getString("phase");
        if (phase.equals("reserve")) {
            page("Recuperar reserva");
            button("Consultar ou concluir reserva", () -> work("Conferindo pedido…", () -> reserve(r)));
            button("Sair", this::logout);
            return;
        }
        page("Operação em andamento"); line(money(r.getInt("amount")) + (r.has("reference") ? " · " + r.getString("reference") : ""));
        if (phase.equals("claim")) {
            button("Continuar cobrança", () -> work("Preparando…", () -> charge(r)));
            button("Cancelar antes de passar cartão", () -> work("Cancelando…", () -> {
                try { api.terminal(command(r,"begin")); }
                catch (CounterApi.Failure e) { if (e.status == 404 || e.status == 409) store.save(null); throw e; }
                decline(r,"NOT_SUBMITTED");
            }));
        }
        else if (phase.equals("processing")) {
            button("Consultar última aprovação", () -> work("Consultando PagBank…", () -> {
                if (plug.isServiceBusy()) throw new Exception("Aguarde a transação terminar no terminal.");
                accept(r, plug.getLastApprovedTransaction());
            }));
            button("Conferi o extrato e não houve débito", () -> new AlertDialog.Builder(this)
                .setMessage("Cancelar esta reserva? Confirme somente se verificou no extrato PagBank que o cliente não foi cobrado.")
                .setNegativeButton("Voltar",null).setPositiveButton("Cancelar reserva", (d,w) -> work("Registrando conferência…", () -> {
                    if (plug.isServiceBusy()) throw new Exception("Aguarde a transação terminar no terminal.");
                    PlugPagTransactionResult last = plug.getLastApprovedTransaction();
                    if (Integer.valueOf(PlugPag.RET_OK).equals(last.getResult()) && r.getString("reference").equals(last.getUserReference())) accept(r,last);
                    else decline(r,"REVIEWED_UNPAID");
                })).show());
        } else button("Enviar resultado à bilheteria", () -> work("Enviando…", () -> finishResult(r)));
        button("Sair", this::logout);
    }
}
