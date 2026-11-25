package com.fliplm.cprestudio

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var tracker: StudyTracker
    private lateinit var webView: WebView

    private val overlayPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            if (Settings.canDrawOverlays(this)) {
                enableOverlayNow()
            } else {
                Toast.makeText(
                    this,
                    "Permissão de sobreposição não concedida.",
                    Toast.LENGTH_SHORT
                ).show()
                notifyWebStateChanged()
            }
        }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            startOverlayService()
            notifyWebStateChanged()
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tracker = StudyTracker(this)

        // Respeita corretamente barra de status (relógio/notificações) e barra de navegação
        WindowCompat.setDecorFitsSystemWindows(window, true)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#FAFAFA"))
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mediaPlaybackRequiresUserGesture = false
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.setSupportZoom(false)

            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            addJavascriptInterface(ProfessorJsBridge(), "AndroidProfessor")

            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val uri = request?.url ?: return false
                    val host = uri.host ?: return false
                    val allowedHost = Uri.parse(tracker.baseUrl).host
                    return if (host == allowedHost || host.endsWith("supabase.co")) {
                        false
                    } else {
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, uri))
                        } catch (_: Exception) {
                        }
                        true
                    }
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    CookieManager.getInstance().flush()
                    injectWebBridge(view)
                }
            }
        }
        root.addView(webView)

        // Aplica os insets no container raiz (WebView ignora padding interno em Android 15+)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        webView.loadUrl("${tracker.baseUrl}/estudar")

        if (tracker.overlayEnabled && Settings.canDrawOverlays(this)) {
            startOverlayService()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra(EXTRA_OPEN_STUDY, false)) {
            val targetUrl = "${tracker.baseUrl}/estudar"
            if (webView.url?.contains("/estudar") != true) {
                webView.loadUrl(targetUrl)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
        ProfessorOverlayService.isAppInForeground = true
        if (ProfessorOverlayService.isRunning) {
            sendServiceAction(ProfessorOverlayService.ACTION_APP_FOREGROUND)
        }
        notifyWebStateChanged()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()
        CookieManager.getInstance().flush()
        ProfessorOverlayService.isAppInForeground = false
        if (ProfessorOverlayService.isRunning) {
            sendServiceAction(ProfessorOverlayService.ACTION_APP_BACKGROUND)
        }
    }

    override fun onDestroy() {
        try {
            webView.stopLoading()
            webView.onPause()
            webView.pauseTimers()
            webView.loadUrl("about:blank")
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.removeAllViews()
            webView.destroy()
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    private fun toggleOverlayOnUiThread() {
        if (ProfessorOverlayService.isRunning || tracker.overlayEnabled) {
            tracker.overlayEnabled = false
            sendServiceAction(ProfessorOverlayService.ACTION_STOP)
            Toast.makeText(this, "Professor flutuante desativado.", Toast.LENGTH_SHORT).show()
            notifyWebStateChanged()
            return
        }

        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(
                this,
                "Autorize 'Sobrepor a outros apps' para o Prof. IREB ficar na tela.",
                Toast.LENGTH_LONG
            ).show()
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            overlayPermissionLauncher.launch(intent)
            return
        }

        enableOverlayNow()
    }

    private fun enableOverlayNow() {
        tracker.overlayEnabled = true
        tracker.snoozeUntilMs = 0L
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                notifyWebStateChanged()
                return
            }
        }
        startOverlayService()
        notifyWebStateChanged()
        Toast.makeText(
            this,
            "Prof. IREB ativado! Ele aparecerá sobre outros apps quando você sair daqui.",
            Toast.LENGTH_LONG
        ).show()
    }

    private fun startOverlayService() {
        val intent = Intent(this, ProfessorOverlayService::class.java).apply {
            action = ProfessorOverlayService.ACTION_START
        }
        ContextCompat.startForegroundService(this, intent)
    }

    private fun sendServiceAction(action: String) {
        val intent = Intent(this, ProfessorOverlayService::class.java).apply {
            this.action = action
        }
        startService(intent)
    }

    private fun notifyWebStateChanged() {
        runOnUiThread {
            webView.evaluateJavascript(
                "window.dispatchEvent(new Event('android-professor-state'));",
                null
            )
        }
    }

    private fun injectWebBridge(view: WebView?) {
        val js = """
            (function() {
              if (!window.__cpreAndroidFetchHooked) {
                window.__cpreAndroidFetchHooked = true;
                const origFetch = window.fetch;
                window.fetch = async function(...args) {
                  const res = await origFetch.apply(this, args);
                  try {
                    const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
                    const method = ((args[1] && args[1].method) || (args[0] && args[0].method) || 'GET').toUpperCase();
                    if (res && res.ok && method === 'POST' && (reqUrl.includes('/attempt') || reqUrl.includes('/finish'))) {
                      if (window.AndroidProfessor && window.AndroidProfessor.onQuestionAnswered) {
                        window.AndroidProfessor.onQuestionAnswered();
                      }
                    }
                  } catch (e) {}
                  return res;
                };
              }

              function renderFallbackSettingsCard(forceRefresh) {
                if (!window.location.pathname.startsWith('/configuracoes')) return;
                if (!window.AndroidProfessor || !window.AndroidProfessor.getStateJson) return;
                if (document.getElementById('android-professor-settings-card')) return;

                let card = document.getElementById('android-professor-fallback-card');
                if (card && !forceRefresh) return;

                const main = document.querySelector('main');
                if (!main) return;
                const heading = main.querySelector('h1');
                if (!heading || !heading.parentElement) return;

                let state;
                try { state = JSON.parse(window.AndroidProfessor.getStateJson()); } catch (e) { return; }

                if (!card) {
                  card = document.createElement('section');
                  card.id = 'android-professor-fallback-card';
                  card.style.cssText = 'background:#fff;border:1px solid #c7d2fe;border-radius:16px;padding:20px;margin:16px 0;font-family:inherit;';
                  heading.parentElement.insertAdjacentElement('afterend', card);
                }

                const hrs = Math.max(1, Math.round((state.windowMinutes || 120) / 60));
                const enabled = !!state.enabled;

                card.innerHTML =
                  '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
                    '<strong style="font-size:15px;color:#09090b;">Professor Flutuante na Tela (Android)</strong>' +
                    '<span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;background:' + (enabled ? '#ecfdf5;color:#047857;border:1px solid #a7f3d0;' : '#f4f4f5;color:#52525b;border:1px solid #e4e4e7;') + '">' +
                      (enabled ? 'Ativado sobre outros apps' : 'Desativado') +
                    '</span>' +
                  '</div>' +
                  '<p style="font-size:12px;color:#52525b;line-height:1.5;margin:0 0 12px 0;">' +
                    'Mantém o Prof. IREB flutuando sobre outros apps. Se ficar <b>' + hrs + 'h</b> sem responder <b>' + state.targetQuestions + ' questões</b>, ele começa a se estressar.' +
                  '</p>' +
                  '<button id="cpre-toggle-overlay-btn" type="button" style="width:100%;padding:11px 16px;border:none;border-radius:12px;font-size:13px;font-weight:600;color:#fff;cursor:pointer;background:' + (enabled ? '#e11d48' : '#4f46e5') + ';margin-bottom:12px;">' +
                    (enabled ? 'Desativar Professor Flutuante' : 'Ativar Professor Flutuante na Tela') +
                  '</button>' +
                  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
                    '<label style="font-size:11px;color:#52525b;">Meta de questões<input id="cpre-target-input" type="number" min="1" max="100" value="' + state.targetQuestions + '" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #e4e4e7;border-radius:10px;font-size:14px;color:#09090b;box-sizing:border-box;"/></label>' +
                    '<label style="font-size:11px;color:#52525b;">Janela (min, 120=2h)<input id="cpre-window-input" type="number" min="5" max="720" value="' + state.windowMinutes + '" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #e4e4e7;border-radius:10px;font-size:14px;color:#09090b;box-sizing:border-box;"/></label>' +
                  '</div>' +
                  '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#3f3f46;margin-bottom:8px;">' +
                    '<input id="cpre-sound-check" type="checkbox"' + (state.soundEnabled !== false ? ' checked' : '') + '/> Som quando o professor estressar' +
                  '</label>' +
                  '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#3f3f46;margin-bottom:12px;">' +
                    '<input id="cpre-stress-check" type="checkbox"' + (state.testStressMode ? ' checked' : '') + '/> Testar modo estressado agora' +
                  '</label>' +
                  '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                    '<button id="cpre-save-overlay-btn" type="button" style="padding:9px 14px;border:none;border-radius:10px;font-size:12px;font-weight:600;color:#fff;background:#18181b;cursor:pointer;">Salvar regras</button>' +
                    '<button id="cpre-test-sound-btn" type="button" style="padding:9px 14px;border:1px solid #e4e4e7;border-radius:10px;font-size:12px;font-weight:600;color:#18181b;background:#fafafa;cursor:pointer;">🔊 Testar som</button>' +
                  '</div>';

                const toggleBtn = document.getElementById('cpre-toggle-overlay-btn');
                if (toggleBtn) toggleBtn.onclick = function() {
                  window.AndroidProfessor.toggleOverlay();
                  setTimeout(function() { renderFallbackSettingsCard(true); }, 250);
                };

                const testSoundBtn = document.getElementById('cpre-test-sound-btn');
                if (testSoundBtn) testSoundBtn.onclick = function() {
                  if (window.AndroidProfessor.playTestSound) {
                    window.AndroidProfessor.playTestSound();
                  }
                };

                const saveBtn = document.getElementById('cpre-save-overlay-btn');
                if (saveBtn) saveBtn.onclick = function() {
                  const t = parseInt(document.getElementById('cpre-target-input').value, 10) || 10;
                  const w = parseInt(document.getElementById('cpre-window-input').value, 10) || 120;
                  const s = !!document.getElementById('cpre-stress-check').checked;
                  const snd = !!document.getElementById('cpre-sound-check').checked;
                  if (window.AndroidProfessor.saveSettingsV2) {
                    window.AndroidProfessor.saveSettingsV2(t, w, s, snd);
                  } else {
                    window.AndroidProfessor.saveSettings(t, w, s);
                  }
                  setTimeout(function() { renderFallbackSettingsCard(true); }, 200);
                };
              }

              if (!window.__cpreAndroidSettingsObserved) {
                window.__cpreAndroidSettingsObserved = true;
                window.addEventListener('android-professor-state', function() {
                  renderFallbackSettingsCard(true);
                });
                setInterval(function() {
                  renderFallbackSettingsCard(false);
                }, 600);
              }
              renderFallbackSettingsCard(false);
            })();
        """.trimIndent()
        view?.evaluateJavascript(js, null)
    }

    inner class ProfessorJsBridge {
        @JavascriptInterface
        fun getStateJson(): String {
            val active = tracker.overlayEnabled && Settings.canDrawOverlays(this@MainActivity)
            return JSONObject().apply {
                put("enabled", active)
                put("hasPermission", Settings.canDrawOverlays(this@MainActivity))
                put("targetQuestions", tracker.targetQuestions)
                put("windowMinutes", tracker.windowMinutes)
                put("testStressMode", tracker.testStressMode)
                put("soundEnabled", tracker.soundEnabled)
            }.toString()
        }

        @JavascriptInterface
        fun toggleOverlay() {
            runOnUiThread { toggleOverlayOnUiThread() }
        }

        @JavascriptInterface
        fun playTestSound() {
            runOnUiThread {
                try {
                    val mp = MediaPlayer.create(this@MainActivity, R.raw.professor_slam)
                    mp?.setOnCompletionListener { it.release() }
                    mp?.start()
                } catch (_: Exception) {
                }
            }
        }

        @JavascriptInterface
        fun saveSettingsV2(
            targetQuestions: Int,
            windowMinutes: Int,
            testStressMode: Boolean,
            soundEnabled: Boolean
        ) {
            tracker.soundEnabled = soundEnabled
            saveSettings(targetQuestions, windowMinutes, testStressMode)
        }

        @JavascriptInterface
        fun saveSettings(targetQuestions: Int, windowMinutes: Int, testStressMode: Boolean) {
            tracker.targetQuestions = targetQuestions
            tracker.windowMinutes = windowMinutes
            tracker.testStressMode = testStressMode
            runOnUiThread {
                if (ProfessorOverlayService.isRunning) {
                    sendServiceAction(ProfessorOverlayService.ACTION_REFRESH)
                }
                Toast.makeText(
                    this@MainActivity,
                    "Regras do Professor salvas!",
                    Toast.LENGTH_SHORT
                ).show()
                notifyWebStateChanged()
            }
        }

        @JavascriptInterface
        fun onQuestionAnswered() {
            tracker.recordLocalAttempt()
            if (ProfessorOverlayService.isRunning) {
                sendServiceAction(ProfessorOverlayService.ACTION_REFRESH)
            }
        }
    }

    companion object {
        const val EXTRA_OPEN_STUDY = "open_study"
    }
}
