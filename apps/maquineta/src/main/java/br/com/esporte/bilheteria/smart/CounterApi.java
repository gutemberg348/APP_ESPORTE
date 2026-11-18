package br.com.esporte.bilheteria.smart;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

final class CounterApi {
    String terminalKey = "", seller = "";
    private String access = "", refresh = "";
    static class Failure extends IOException {
        final int status;
        final String code;
        Failure(int status, String code, String message) { super(message); this.status = status; this.code = code; }
    }
    static JSONObject obj(Object... pairs) throws JSONException {
        JSONObject o = new JSONObject();
        for (int i = 0; i < pairs.length; i += 2) o.put((String) pairs[i], pairs[i + 1]);
        return o;
    }
    private Object request(String path, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection)new URL(BuildConfig.API_URL + path).openConnection();
        try {
            c.setInstanceFollowRedirects(false);
            c.setUseCaches(false);
            c.setConnectTimeout(10000);
            c.setReadTimeout(18000);
            c.setRequestProperty("Accept", "application/json");
            if (!access.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + access);
            if (path.equals("/bilheteria/moderninha") || path.equals("/bilheteria/moderninha?includePix=true") || (path.equals("/bilheteria/vendas") && body != null && "PAGBANK".equals(body.optString("method"))))
                c.setRequestProperty("X-Terminal-Key", terminalKey);
            if (body != null) {
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = c.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            int status = c.getResponseCode();
            if (status == 204) return null;
            InputStream input = status >= 400 ? c.getErrorStream() : c.getInputStream();
            StringBuilder json = new StringBuilder();
            if (input != null) try (Reader r = new InputStreamReader(input, StandardCharsets.UTF_8)) {
                char[] buf = new char[4096]; int n;
                while ((n = r.read(buf)) != -1) json.append(buf, 0, n);
            }
            if (status / 100 != 2) {
                String message = "Falha na API (HTTP " + status + ").";
                String code = "";
                try {
                    JSONObject error = new JSONObject(json.toString()).getJSONObject("error");
                    message = error.getString("message"); code = error.optString("code");
                }
                catch (JSONException ignored) {}
                throw new Failure(status, code, message);
            }
            return new JSONObject(json.toString()).get("data");
        } finally { c.disconnect(); }
    }
    private void session(JSONObject data) throws JSONException {
        access = data.getString("accessToken");
        refresh = data.getString("refreshToken");
        seller = data.getJSONObject("member").getString("id");
    }
    void login(String email, String password, String key) throws Exception {
        session((JSONObject)request("/auth/login", obj("email", email, "password", password, "portal", "SELLER")));
        terminalKey = key;
    }
    Object terminal(JSONObject command) throws Exception {
        return authenticated(command == null ? "/bilheteria/moderninha?includePix=true" : "/bilheteria/moderninha", command);
    }
    JSONArray lots() throws Exception { return (JSONArray)authenticated("/bilheteria/lotes", null); }
    JSONObject reserve(JSONObject order) throws Exception { return (JSONObject)authenticated("/bilheteria/vendas", order); }
    JSONObject pix(String key) throws Exception {
        return (JSONObject)authenticated("/bilheteria/pix?key=" + URLEncoder.encode(key,"UTF-8"), null);
    }
    JSONObject receipt(String key) throws Exception {
        return (JSONObject)authenticated("/bilheteria/bilhete?key=" + URLEncoder.encode(key,"UTF-8"), null);
    }
    JSONObject tickets(String key) throws Exception {
        return (JSONObject)authenticated("/bilheteria/pdf?key=" + URLEncoder.encode(key,"UTF-8"), null);
    }
    private Object authenticated(String path, JSONObject command) throws Exception {
        try { return request(path, command); }
        catch (Failure e) {
            if (e.status != 401) throw e;
            session((JSONObject)request("/auth/refresh", obj("refreshToken", refresh)));
            return request(path, command);
        }
    }
    void logout() {
        try { if (!access.isEmpty()) request("/auth/logout", new JSONObject()); } catch (Exception ignored) {}
        access = ""; refresh = ""; seller = ""; terminalKey = "";
    }
}
