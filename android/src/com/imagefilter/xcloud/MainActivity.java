package com.imagefilter.xcloud;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.Display;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.TreeSet;

public class MainActivity extends Activity {
    private static final String START_URL = "https://www.xbox.com/play";
    private WebView webView;
    private String userscript;
    // play.xbox.com (new site, no Better xCloud): the treatment bound straight to the stream video.
    private String playScript;
    private boolean documentStart;
    private boolean playDocumentStart;
    private SharedPreferences prefs;
    private String refreshRates = "[]";
    // Page the bridge serves; file and clipboard calls are refused for any other site.
    private volatile String currentUrl = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView.setWebContentsDebuggingEnabled(true);

        prefs = getSharedPreferences("app", MODE_PRIVATE);
        refreshRates = supportedRefreshRates();
        applyRefreshRate(prefs.getInt("refreshRate", 0));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        setContentView(webView);
        hideSystemBars();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setOffscreenPreRaster(true);
        // xCloud treats the WebView token ("; wv") as an unsupported browser: present as Chrome.
        settings.setUserAgentString(settings.getUserAgentString().replace("; wv", "").replace("Version/4.0 ", ""));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new Bridge(), "BxAndroid");

        userscript = wrap(readAsset("userscript.js"));
        documentStart = DocumentStart.add(webView, userscript, new String[]{"https://www.xbox.com"});
        playScript = wrapPlay(readAsset("play.js"));
        playDocumentStart = DocumentStart.add(webView, playScript, new String[]{"https://play.xbox.com"});
        if (!documentStart) {
            Toast.makeText(this, getString(R.string.late_injection), Toast.LENGTH_LONG).show();
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                currentUrl = url == null ? "" : url;
                // Fallback for old WebView builds; the wrapper ignores a second run.
                if (!documentStart && url != null && url.startsWith("https://www.xbox.com/")) {
                    view.evaluateJavascript(userscript, null);
                }
                if (!playDocumentStart && url != null && url.startsWith("https://play.xbox.com/")) {
                    view.evaluateJavascript(playScript, null);
                }
            }
        });

        webView.requestFocus();
        // restoreState returns null when nothing could be restored: load the start page instead of a blank screen.
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) webView.loadUrl(START_URL);
    }

    /** Panel bridge (window.BxAndroid): fixed display refresh rate and app info. */
    private final class Bridge {
        @JavascriptInterface public String getRefreshRates() { return refreshRates; }
        @JavascriptInterface public int getRefreshRate() { return prefs.getInt("refreshRate", 0); }
        @JavascriptInterface public String getAppInfo() { return BuildConfigInfo.VERSION; }
        @JavascriptInterface public void setRefreshRate(final int hz) {
            prefs.edit().putInt("refreshRate", Math.max(0, hz)).apply();
            runOnUiThread(new Runnable() { @Override public void run() { applyRefreshRate(hz); } });
        }
        /** Copies text (configuration) to the clipboard; the WebView may deny navigator.clipboard. */
        @JavascriptInterface public boolean copyText(final String text) {
            if (!fromXbox() || text == null) return false;
            runOnUiThread(new Runnable() { @Override public void run() {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("xCloud ImageFilter", text));
                Toast.makeText(MainActivity.this, getString(R.string.settings_copied), Toast.LENGTH_SHORT).show();
            } });
            return true;
        }
        /** Saves a text file (measurement export) to Downloads/xCloud ImageFilter; returns where, or "" on failure. */
        @JavascriptInterface public String saveFile(String name, String mime, String text) {
            if (!fromXbox() || name == null || text == null) return "";
            final String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            try {
                byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                final String where;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mime == null ? "application/json" : mime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/xCloud ImageFilter");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return "";
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(bytes); }
                    where = "Downloads/xCloud ImageFilter/" + safe;
                } else {
                    // Android 9: app folder, no storage permission needed.
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File file = new File(dir, safe);
                    try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); }
                    where = file.getAbsolutePath();
                }
                runOnUiThread(new Runnable() { @Override public void run() {
                    Toast.makeText(MainActivity.this, getString(R.string.measurement_saved, where), Toast.LENGTH_LONG).show();
                } });
                return where;
            } catch (Exception error) {
                android.util.Log.w("XCloudImageFilter", "saveFile failed", error);
                return "";
            }
        }
        private boolean fromXbox() {
            Uri uri = Uri.parse(currentUrl);
            String host = uri.getHost();
            return "https".equals(uri.getScheme()) && host != null && (host.equals("www.xbox.com") || host.equals("xbox.com") || host.equals("play.xbox.com"));
        }
    }

    /** Refresh rates offered by the panel: the modes with the current resolution. */
    private String supportedRefreshRates() {
        Display display = getWindowManager().getDefaultDisplay();
        Display.Mode current = display.getMode();
        TreeSet<Integer> rates = new TreeSet<>();
        for (Display.Mode mode : display.getSupportedModes()) {
            if (mode.getPhysicalWidth() == current.getPhysicalWidth() && mode.getPhysicalHeight() == current.getPhysicalHeight()) {
                rates.add(Math.round(mode.getRefreshRate()));
            }
        }
        return rates.toString().replace(" ", "");
    }

    /**
     * 0 lets the system choose (it may switch rates on its own). Otherwise the window asks for the
     * mode with the current resolution and the closest refresh rate, so frame pacing stays constant.
     */
    private void applyRefreshRate(int hz) {
        WindowManager.LayoutParams params = getWindow().getAttributes();
        params.preferredDisplayModeId = 0;
        params.preferredRefreshRate = 0;
        if (hz > 0) {
            Display display = getWindowManager().getDefaultDisplay();
            Display.Mode current = display.getMode(), best = null;
            for (Display.Mode mode : display.getSupportedModes()) {
                if (mode.getPhysicalWidth() != current.getPhysicalWidth() || mode.getPhysicalHeight() != current.getPhysicalHeight()) continue;
                if (best == null || Math.abs(mode.getRefreshRate() - hz) < Math.abs(best.getRefreshRate() - hz)) best = mode;
            }
            if (best != null) {
                params.preferredDisplayModeId = best.getModeId();
                params.preferredRefreshRate = best.getRefreshRate();
            }
        }
        getWindow().setAttributes(params);
    }

    /** Applies the userscript @match/@exclude rules, top frame only, once per document. */
    private static String wrap(String script) {
        return "(function(){var p=location.pathname,s=location.search;"
                + "if(window.top!==window||window.__bxImageFilter)return;"
                + "if(!(/^\\/[^\\/]+\\/play/.test(p)||(/^\\/[^\\/]+\\/auth\\/msa/.test(p)&&/loggedIn/.test(s))))return;"
                + "if(/\\/xbox-game-pass\\/play-day-one/.test(p))return;"
                + "window.__bxImageFilter=true;"
                + "window.BX_FLAGS=Object.assign({DeviceInfo:{deviceType:'android'}},window.BX_FLAGS||{});"
                // xCloud picks the stream size from the reported OS: Android gets 720p. Unless the
                // user already chose a target resolution, start at Better xCloud's 1080p (HQ).
                + "try{var k='BetterXcloud',g=JSON.parse(localStorage.getItem(k)||'{}');"
                + "if(!('stream.video.resolution' in g)){g['stream.video.resolution']='1080p-hq';localStorage.setItem(k,JSON.stringify(g));}}catch(e){}\n"
                + script
                + "\n})();";
    }

    /** play.xbox.com: top frame, once per document. The page's own CSP does not apply to injected scripts. */
    private static String wrapPlay(String script) {
        return "(function(){"
                + "if(window.top!==window||location.hostname!=='play.xbox.com'||window.__bxImageFilterPlay)return;"
                + "window.__bxImageFilterPlay=true;\n"
                + script
                + "\n})();";
    }

    private String readAsset(String name) {
        try (InputStream input = getAssets().open(name)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[65536];
            int read;
            while ((read = input.read(buffer)) > 0) output.write(buffer, 0, read);
            return output.toString("UTF-8");
        } catch (Exception error) {
            throw new IllegalStateException("Missing asset " + name, error);
        }
    }

    private void hideSystemBars() {
        WindowInsetsController controller = Build.VERSION.SDK_INT >= 30 ? getWindow().getInsetsController() : null;
        if (controller != null) {
            controller.hide(WindowInsets.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // An unhandled gamepad B is turned into BACK by Android; it must not leave the game.
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK
                && (event.getSource() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD) {
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
