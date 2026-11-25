package com.fliplm.cprestudio

import android.content.Context
import android.webkit.CookieManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

enum class ProfessorMood(val assetPath: String, val frames: Int, val fps: Int) {
    IDLE("sprites/professor-idle-sheet-512px.png", 4, 3),
    THINKING("sprites/professor-thinking-sheet-512px.png", 4, 3),
    TALKING("sprites/professor-talking-sheet-512px.png", 4, 7),
    ANGRY_SLAM("sprites/professor-angry_slam-sheet-512px.png", 6, 8),
    CELEBRATE_CLAP("sprites/professor-celebrate_clap-sheet-512px.png", 4, 6),
}

data class RealtimeConfig(
    val url: String,
    val anonKey: String,
    val accessToken: String,
)

data class ProfessorStatus(
    val answeredInWindow: Int,
    val targetQuestions: Int,
    val windowMinutes: Int,
    val goalMet: Boolean,
    val stressed: Boolean,
    val mood: ProfessorMood,
    val message: String,
    val fromServer: Boolean,
    val realtimeConfig: RealtimeConfig? = null,
)

class StudyTracker(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var baseUrl: String
        get() = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL)
            ?.trim()
            ?.trimEnd('/')
            ?.ifEmpty { DEFAULT_BASE_URL }
            ?: DEFAULT_BASE_URL
        set(value) {
            val clean = value.trim().trimEnd('/').ifEmpty { DEFAULT_BASE_URL }
            prefs.edit().putString(KEY_BASE_URL, clean).apply()
        }

    var windowMinutes: Int
        get() = prefs.getInt(KEY_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES).coerceIn(5, 720)
        set(value) = prefs.edit().putInt(KEY_WINDOW_MINUTES, value.coerceIn(5, 720)).apply()

    var targetQuestions: Int
        get() = prefs.getInt(KEY_TARGET_QUESTIONS, DEFAULT_TARGET_QUESTIONS).coerceIn(1, 100)
        set(value) = prefs.edit().putInt(KEY_TARGET_QUESTIONS, value.coerceIn(1, 100)).apply()

    var overlayEnabled: Boolean
        get() = prefs.getBoolean(KEY_OVERLAY_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_OVERLAY_ENABLED, value).apply()

    var testStressMode: Boolean
        get() = prefs.getBoolean(KEY_TEST_STRESS, false)
        set(value) = prefs.edit().putBoolean(KEY_TEST_STRESS, value).apply()

    var soundEnabled: Boolean
        get() = prefs.getBoolean(KEY_SOUND_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_SOUND_ENABLED, value).apply()

    var overlayX: Int
        get() = prefs.getInt(KEY_OVERLAY_X, 24)
        set(value) = prefs.edit().putInt(KEY_OVERLAY_X, value).apply()

    var overlayY: Int
        get() = prefs.getInt(KEY_OVERLAY_Y, 260)
        set(value) = prefs.edit().putInt(KEY_OVERLAY_Y, value).apply()

    var snoozeUntilMs: Long
        get() = prefs.getLong(KEY_SNOOZE_UNTIL, 0L)
        set(value) = prefs.edit().putLong(KEY_SNOOZE_UNTIL, value).apply()

    fun isSnoozed(): Boolean = System.currentTimeMillis() < snoozeUntilMs

    fun markOverlayStartedIfNeeded() {
        if (prefs.getLong(KEY_OVERLAY_STARTED_MS, 0L) == 0L) {
            prefs.edit().putLong(KEY_OVERLAY_STARTED_MS, System.currentTimeMillis()).apply()
        }
    }

    fun recordLocalAttempt(nowMs: Long = System.currentTimeMillis()) {
        val list = getLocalAttempts(nowMs).toMutableList()
        list.add(nowMs)
        val encoded = list.joinToString(",")
        prefs.edit()
            .putString(KEY_LOCAL_ATTEMPTS, encoded)
            .putLong(KEY_LAST_ATTEMPT_MS, nowMs)
            .apply()
    }

    private fun getLocalAttempts(nowMs: Long = System.currentTimeMillis()): List<Long> {
        val raw = prefs.getString(KEY_LOCAL_ATTEMPTS, "") ?: ""
        if (raw.isBlank()) return emptyList()
        val cutoff = nowMs - (windowMinutes.toLong() * 60_000L)
        return raw.split(",")
            .mapNotNull { it.trim().toLongOrNull() }
            .filter { it >= cutoff }
    }

    fun fetchStatusBlocking(): ProfessorStatus {
        val winMin = windowMinutes
        val target = targetQuestions

        if (testStressMode) {
            val localCount = getLocalAttempts().size
            return ProfessorStatus(
                answeredInWindow = localCount,
                targetQuestions = target,
                windowMinutes = winMin,
                goalMet = false,
                stressed = true,
                mood = ProfessorMood.ANGRY_SLAM,
                message = "OBJEÇÃO! Modo teste ativo: bora fazer $target questões!",
                fromServer = false,
            )
        }

        // Tenta sincronizar com /api/professor-status usando os cookies de login do WebView
        try {
            val urlStr = "$baseUrl/api/professor-status?windowMinutes=$winMin&target=$target"
            val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 5000
                readTimeout = 5000
                setRequestProperty("Accept", "application/json")
                val cookies = CookieManager.getInstance().getCookie(baseUrl)
                if (!cookies.isNullOrBlank()) {
                    setRequestProperty("Cookie", cookies)
                }
            }

            if (conn.responseCode == 200) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                conn.disconnect()
                val json = JSONObject(body)
                val answered = json.optInt("answeredInWindow", 0)
                val goalMet = json.optBoolean("goalMet", answered >= target)
                val stressed = json.optBoolean("stressed", false)
                val moodStr = json.optString("mood", "idle")
                val mood = when (moodStr) {
                    "angry_slam" -> ProfessorMood.ANGRY_SLAM
                    "thinking" -> ProfessorMood.THINKING
                    "celebrate_clap" -> ProfessorMood.CELEBRATE_CLAP
                    "talking" -> ProfessorMood.TALKING
                    else -> ProfessorMood.IDLE
                }
                val msg = json.optString("message", "$answered/$target questões.")
                val rtObj = json.optJSONObject("realtime")
                val rtConfig = if (rtObj != null) {
                    val rtUrl = rtObj.optString("url", "")
                    val rtKey = rtObj.optString("anonKey", "")
                    val rtTok = rtObj.optString("accessToken", "")
                    if (rtUrl.isNotBlank() && rtKey.isNotBlank() && rtTok.isNotBlank()) {
                        RealtimeConfig(rtUrl, rtKey, rtTok)
                    } else null
                } else null
                return ProfessorStatus(
                    answeredInWindow = answered,
                    targetQuestions = target,
                    windowMinutes = winMin,
                    goalMet = goalMet,
                    stressed = stressed,
                    mood = mood,
                    message = msg,
                    fromServer = true,
                    realtimeConfig = rtConfig,
                )
            }
            conn.disconnect()
        } catch (_: Exception) {
            // Fallback local abaixo caso offline ou rota ainda não publicada
        }

        return computeLocalStatus()
    }

    fun computeLocalStatus(nowMs: Long = System.currentTimeMillis()): ProfessorStatus {
        val winMin = windowMinutes
        val target = targetQuestions

        if (testStressMode) {
            return ProfessorStatus(
                answeredInWindow = getLocalAttempts(nowMs).size,
                targetQuestions = target,
                windowMinutes = winMin,
                goalMet = false,
                stressed = true,
                mood = ProfessorMood.ANGRY_SLAM,
                message = "OBJEÇÃO! Modo teste ativo: bora fazer $target questões!",
                fromServer = false,
            )
        }

        val recent = getLocalAttempts(nowMs)
        val answered = recent.size
        val remaining = (target - answered).coerceAtLeast(0)
        val goalMet = answered >= target

        val lastAttemptMs = prefs.getLong(KEY_LAST_ATTEMPT_MS, 0L)
        val startedMs = prefs.getLong(KEY_OVERLAY_STARTED_MS, nowMs)
        val referenceMs = if (lastAttemptMs > 0L) lastAttemptMs else startedMs
        val elapsedMinutes = ((nowMs - referenceMs) / 60_000L).coerceAtLeast(0L)
        val warningMinutes = (winMin * 0.75).toLong()

        return when {
            goalMet -> ProfessorStatus(
                answeredInWindow = answered,
                targetQuestions = target,
                windowMinutes = winMin,
                goalMet = true,
                stressed = false,
                mood = ProfessorMood.IDLE,
                message = "Meta batida! $answered/$target questões.",
                fromServer = false,
            )

            elapsedMinutes >= winMin -> ProfessorStatus(
                answeredInWindow = answered,
                targetQuestions = target,
                windowMinutes = winMin,
                goalMet = false,
                stressed = true,
                mood = ProfessorMood.ANGRY_SLAM,
                message = "OBJEÇÃO! ${winMin / 60}h sem $target questões! Faltam $remaining!",
                fromServer = false,
            )

            elapsedMinutes >= warningMinutes -> ProfessorStatus(
                answeredInWindow = answered,
                targetQuestions = target,
                windowMinutes = winMin,
                goalMet = false,
                stressed = false,
                mood = ProfessorMood.THINKING,
                message = "Faltam $remaining questões para a meta...",
                fromServer = false,
            )

            else -> ProfessorStatus(
                answeredInWindow = answered,
                targetQuestions = target,
                windowMinutes = winMin,
                goalMet = false,
                stressed = false,
                mood = ProfessorMood.IDLE,
                message = "$answered/$target questões nas últimas ${winMin / 60}h.",
                fromServer = false,
            )
        }
    }

    companion object {
        private const val PREFS_NAME = "cpre_professor_prefs"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_WINDOW_MINUTES = "window_minutes"
        private const val KEY_TARGET_QUESTIONS = "target_questions"
        private const val KEY_OVERLAY_ENABLED = "overlay_enabled"
        private const val KEY_TEST_STRESS = "test_stress"
        private const val KEY_SOUND_ENABLED = "sound_enabled"
        private const val KEY_OVERLAY_X = "overlay_x"
        private const val KEY_OVERLAY_Y = "overlay_y"
        private const val KEY_SNOOZE_UNTIL = "snooze_until"
        private const val KEY_LOCAL_ATTEMPTS = "local_attempts"
        private const val KEY_LAST_ATTEMPT_MS = "last_attempt_ms"
        private const val KEY_OVERLAY_STARTED_MS = "overlay_started_ms"

        const val DEFAULT_BASE_URL = "https://ireb-cpre-studio.vercel.app"
        const val DEFAULT_WINDOW_MINUTES = 120
        const val DEFAULT_TARGET_QUESTIONS = 10
    }
}
