package com.fliplm.cprestudio

import android.net.Uri
import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class RealtimeListener(private val onAttemptInserted: () -> Unit) {

    private val client = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val handler = Handler(Looper.getMainLooper())
    private val refCounter = AtomicInteger(1)

    private var webSocket: WebSocket? = null
    private var currentConfig: RealtimeConfig? = null
    private var stopped = false

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            val ws = webSocket ?: return
            val hb = JSONObject().apply {
                put("topic", "phoenix")
                put("event", "heartbeat")
                put("payload", JSONObject())
                put("ref", refCounter.incrementAndGet().toString())
            }
            ws.send(hb.toString())
            handler.postDelayed(this, 25_000L)
        }
    }

    private val reconnectRunnable = Runnable {
        if (!stopped) {
            currentConfig?.let { openSocket(it) }
        }
    }

    fun updateConfig(config: RealtimeConfig?) {
        if (config == null) return
        if (stopped) return
        if (currentConfig == config && webSocket != null) return
        currentConfig = config
        openSocket(config)
    }

    fun stop() {
        stopped = true
        handler.removeCallbacksAndMessages(null)
        try {
            webSocket?.close(1000, "Service stopped")
        } catch (_: Exception) {
        }
        webSocket = null
        client.dispatcher.executorService.shutdown()
    }

    private fun openSocket(config: RealtimeConfig) {
        handler.removeCallbacks(heartbeatRunnable)
        handler.removeCallbacks(reconnectRunnable)
        try {
            webSocket?.close(1000, "Reconnecting")
        } catch (_: Exception) {
        }
        webSocket = null

        val host = Uri.parse(config.url).host ?: return
        val wsUrl = "wss://$host/realtime/v1/websocket?apikey=${Uri.encode(config.anonKey)}&vsn=1.0.0"
        val request = Request.Builder().url(wsUrl).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                val pgChange = JSONObject().apply {
                    put("event", "INSERT")
                    put("schema", "public")
                    put("table", "user_attempts")
                }
                val cfgObj = JSONObject().apply {
                    put("broadcast", JSONObject().apply {
                        put("ack", false)
                        put("self", false)
                    })
                    put("presence", JSONObject().apply { put("key", "") })
                    put("postgres_changes", JSONArray().put(pgChange))
                }
                val joinMsg = JSONObject().apply {
                    put("topic", "realtime:public:user_attempts")
                    put("event", "phx_join")
                    put("payload", JSONObject().apply {
                        put("config", cfgObj)
                        put("access_token", config.accessToken)
                    })
                    put("ref", refCounter.incrementAndGet().toString())
                }
                ws.send(joinMsg.toString())
                handler.removeCallbacks(heartbeatRunnable)
                handler.postDelayed(heartbeatRunnable, 25_000L)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    if (json.optString("event") == "postgres_changes") {
                        handler.post { onAttemptInserted() }
                    }
                } catch (_: Exception) {
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                if (webSocket === ws) webSocket = null
                handler.removeCallbacks(heartbeatRunnable)
                if (!stopped) {
                    handler.removeCallbacks(reconnectRunnable)
                    handler.postDelayed(reconnectRunnable, 6_000L)
                }
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                if (webSocket === ws) webSocket = null
                handler.removeCallbacks(heartbeatRunnable)
                if (!stopped) {
                    handler.removeCallbacks(reconnectRunnable)
                    handler.postDelayed(reconnectRunnable, 6_000L)
                }
            }
        })
    }
}
