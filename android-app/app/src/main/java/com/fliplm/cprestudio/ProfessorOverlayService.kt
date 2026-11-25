package com.fliplm.cprestudio

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import java.util.concurrent.Executors
import kotlin.math.abs

class ProfessorOverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var tracker: StudyTracker

    private var rootContainer: LinearLayout? = null
    private var bubbleText: TextView? = null
    private var spriteView: ProfessorSpriteView? = null
    private var badgeText: TextView? = null
    private var quickMenuRow: LinearLayout? = null
    private var layoutParams: WindowManager.LayoutParams? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private val ioExecutor = Executors.newSingleThreadExecutor()
    private var realtimeListener: RealtimeListener? = null

    private var lastStressedState = false
    private var lastAlertMs = 0L
    private var stressSoundIndex = 0
    private var activePlayer: MediaPlayer? = null
    private var currentStatus: ProfessorStatus? = null

    private val pollRunnable = object : Runnable {
        override fun run() {
            refreshStatusAsync()
            mainHandler.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        tracker = StudyTracker(this)
        tracker.markOverlayStartedIfNeeded()
        isRunning = true

        createNotificationChannel()
        val notif = buildNotification("Prof. IREB acompanhando suas metas de estudo")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notif,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notif)
        }

        if (Settings.canDrawOverlays(this)) {
            createOverlayView()
            applyVisibility()
        }

        realtimeListener = RealtimeListener {
            mainHandler.postDelayed({ refreshStatusAsync() }, 150L)
        }
        mainHandler.post(pollRunnable)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                tracker.overlayEnabled = false
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_APP_FOREGROUND -> {
                isAppInForeground = true
                applyVisibility()
            }

            ACTION_APP_BACKGROUND -> {
                isAppInForeground = false
                applyVisibility()
                refreshStatusAsync()
            }

            ACTION_REFRESH -> {
                refreshStatusAsync()
            }

            ACTION_TEST_SOUND -> {
                playStressSound()
            }

            else -> {
                if (rootContainer == null && Settings.canDrawOverlays(this)) {
                    createOverlayView()
                }
                applyVisibility()
                refreshStatusAsync()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        mainHandler.removeCallbacksAndMessages(null)
        realtimeListener?.stop()
        realtimeListener = null
        ioExecutor.shutdownNow()
        releaseActivePlayer()
        rootContainer?.let {
            try {
                windowManager.removeView(it)
            } catch (_: Exception) {
            }
        }
        rootContainer = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()

    @SuppressLint("ClickableViewAccessibility")
    private fun createOverlayView() {
        if (rootContainer != null) return

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            clipChildren = false
            clipToPadding = false
            setPadding(dp(4), dp(4), dp(4), dp(4))
        }

        val bubble = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            maxWidth = dp(172)
            gravity = Gravity.CENTER
            setPadding(dp(10), dp(6), dp(10), dp(6))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(12).toFloat()
                setColor(Color.parseColor("#E11D48"))
                setStroke(dp(1), Color.parseColor("#FFE4E6"))
            }
            visibility = View.GONE
        }
        val bubbleLp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = dp(4)
        }
        container.addView(bubble, bubbleLp)

        val sprite = ProfessorSpriteView(this)
        val spriteLp = LinearLayout.LayoutParams(dp(92), dp(92))
        container.addView(sprite, spriteLp)

        val badge = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(2), dp(8), dp(2))
            text = "0/${tracker.targetQuestions}"
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(99).toFloat()
                setColor(Color.parseColor("#CC18181B"))
            }
        }
        val badgeLp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = dp(-2)
        }
        container.addView(badge, badgeLp)

        val menuRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        val menuLp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = dp(4)
        }

        val snoozeBtn = createMiniChip("Pausar 30m", "#3F3F46") {
            tracker.snoozeUntilMs = System.currentTimeMillis() + 30 * 60_000L
            menuRow.visibility = View.GONE
            applyVisibility()
            mainHandler.postDelayed({
                applyVisibility()
                refreshStatusAsync()
            }, 30 * 60_000L + 1000L)
        }
        val closeBtn = createMiniChip("Fechar", "#BE123C") {
            tracker.overlayEnabled = false
            stopSelf()
        }
        menuRow.addView(
            snoozeBtn,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { rightMargin = dp(4) }
        )
        menuRow.addView(closeBtn)
        container.addView(menuRow, menuLp)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = tracker.overlayX
            y = tracker.overlayY
        }

        var initialX = 0
        var initialY = 0
        var touchStartX = 0f
        var touchStartY = 0f
        var moved = false
        var longPressed = false

        val longPressRunnable = Runnable {
            longPressed = true
            menuRow.visibility = if (menuRow.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            vibrateShort(35L)
        }

        val touchHandler = View.OnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    touchStartX = event.rawX
                    touchStartY = event.rawY
                    moved = false
                    longPressed = false
                    mainHandler.postDelayed(longPressRunnable, 550L)
                    true
                }

                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchStartX).toInt()
                    val dy = (event.rawY - touchStartY).toInt()
                    if (abs(dx) > dp(6) || abs(dy) > dp(6)) {
                        moved = true
                        mainHandler.removeCallbacks(longPressRunnable)
                    }
                    if (moved) {
                        val metrics = resources.displayMetrics
                        val maxX = (metrics.widthPixels - container.width).coerceAtLeast(0)
                        val maxY = (metrics.heightPixels - container.height).coerceAtLeast(0)
                        params.x = (initialX + dx).coerceIn(0, maxX)
                        params.y = (initialY + dy).coerceIn(dp(24), maxY)
                        try {
                            windowManager.updateViewLayout(container, params)
                        } catch (_: Exception) {
                        }
                    }
                    true
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    mainHandler.removeCallbacks(longPressRunnable)
                    if (moved) {
                        tracker.overlayX = params.x
                        tracker.overlayY = params.y
                    } else if (!longPressed && event.action == MotionEvent.ACTION_UP) {
                        menuRow.visibility = View.GONE
                        openStudyScreen()
                    }
                    true
                }

                else -> false
            }
        }

        sprite.setOnTouchListener(touchHandler)
        bubble.setOnTouchListener(touchHandler)
        badge.setOnTouchListener(touchHandler)

        rootContainer = container
        bubbleText = bubble
        spriteView = sprite
        badgeText = badge
        quickMenuRow = menuRow
        layoutParams = params

        windowManager.addView(container, params)
    }

    private fun createMiniChip(label: String, bgHex: String, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            text = label
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            setPadding(dp(8), dp(4), dp(8), dp(4))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(8).toFloat()
                setColor(Color.parseColor(bgHex))
            }
            setOnClickListener { onClick() }
        }
    }

    private fun applyVisibility() {
        val container = rootContainer ?: return
        val shouldHide = isAppInForeground || tracker.isSnoozed()
        container.visibility = if (shouldHide) View.GONE else View.VISIBLE
    }

    private fun openStudyScreen() {
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            )
            putExtra(MainActivity.EXTRA_OPEN_STUDY, true)
        }
        startActivity(intent)
    }

    private fun refreshStatusAsync() {
        if (ioExecutor.isShutdown) return
        ioExecutor.execute {
            val status = tracker.fetchStatusBlocking()
            mainHandler.post {
                if (status.realtimeConfig != null) {
                    realtimeListener?.updateConfig(status.realtimeConfig)
                }
                renderStatus(status)
            }
        }
    }

    private fun renderStatus(status: ProfessorStatus) {
        currentStatus = status
        val sprite = spriteView ?: return
        val badge = badgeText ?: return
        val bubble = bubbleText ?: return

        sprite.setMood(status.mood)

        val targetSpriteDp = if (status.stressed) 104 else 92
        val lp = sprite.layoutParams
        if (lp != null && lp.width != dp(targetSpriteDp)) {
            lp.width = dp(targetSpriteDp)
            lp.height = dp(targetSpriteDp)
            sprite.layoutParams = lp
        }

        val badgeBg = badge.background as? GradientDrawable
        when {
            status.stressed -> {
                badge.text = "BORA! ${status.answeredInWindow}/${status.targetQuestions}"
                badgeBg?.setColor(Color.parseColor("#E11D48"))
                bubble.text = status.message
                (bubble.background as? GradientDrawable)?.setColor(Color.parseColor("#E11D48"))
                bubble.visibility = View.VISIBLE

                val now = System.currentTimeMillis()
                val shouldAlert = !lastStressedState || (now - lastAlertMs >= 5 * 60_000L)
                if (shouldAlert && !isAppInForeground && !tracker.isSnoozed()) {
                    vibrateStressPattern()
                    if (tracker.soundEnabled) {
                        playStressSound()
                    }
                    lastAlertMs = now
                }
            }

            status.mood == ProfessorMood.THINKING -> {
                badge.text = "${status.answeredInWindow}/${status.targetQuestions} ⏳"
                badgeBg?.setColor(Color.parseColor("#D97706"))
                bubble.text = status.message
                (bubble.background as? GradientDrawable)?.setColor(Color.parseColor("#D97706"))
                bubble.visibility = View.VISIBLE
            }

            status.goalMet -> {
                badge.text = "${status.answeredInWindow}/${status.targetQuestions} ✓"
                badgeBg?.setColor(Color.parseColor("#059669"))
                bubble.visibility = View.GONE
            }

            else -> {
                badge.text = "${status.answeredInWindow}/${status.targetQuestions}"
                badgeBg?.setColor(Color.parseColor("#CC18181B"))
                bubble.visibility = View.GONE
            }
        }

        lastStressedState = status.stressed
        updateNotification(status)
        applyVisibility()
    }

    private fun vibrateShort(durationMs: Long) {
        try {
            val vibrator = getVibrator()
            vibrator?.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {
        }
    }

    private fun vibrateStressPattern() {
        try {
            val vibrator = getVibrator()
            val timings = longArrayOf(0, 120, 90, 160)
            vibrator?.vibrate(VibrationEffect.createWaveform(timings, -1))
        } catch (_: Exception) {
        }
    }

    private fun releaseActivePlayer() {
        try {
            activePlayer?.stop()
        } catch (_: Exception) {
        }
        try {
            activePlayer?.release()
        } catch (_: Exception) {
        }
        activePlayer = null
    }

    private fun playStressSound() {
        val sounds = intArrayOf(
            R.raw.professor_slam,
            R.raw.professor_grumble,
            R.raw.professor_alarm
        )
        val resId = sounds[stressSoundIndex % sounds.size]
        stressSoundIndex++
        try {
            releaseActivePlayer()
            val afd = resources.openRawResourceFd(resId) ?: return
            val player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                afd.close()
                setOnCompletionListener { mp ->
                    try {
                        mp.release()
                    } catch (_: Exception) {
                    }
                    if (activePlayer === mp) activePlayer = null
                }
                prepare()
                start()
            }
            activePlayer = player
        } catch (_: Exception) {
        }
    }

    private fun getVibrator(): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val mgr = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            mgr?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Professor IREB Flutuante",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Mantém o Prof. IREB ativo sobre outros aplicativos"
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(contentText: String): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            putExtra(MainActivity.EXTRA_OPEN_STUDY, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val openPending = PendingIntent.getActivity(
            this,
            100,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, ProfessorOverlayService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPending = PendingIntent.getService(
            this,
            101,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Prof. IREB na tela")
            .setContentText(contentText)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openPending)
            .addAction(0, "Estudar agora", openPending)
            .addAction(0, "Desativar", stopPending)
            .build()
    }

    private fun updateNotification(status: ProfessorStatus) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val text = if (status.stressed) {
            status.message
        } else {
            "${status.answeredInWindow}/${status.targetQuestions} questões nas últimas ${status.windowMinutes / 60}h"
        }
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    companion object {
        const val ACTION_START = "com.fliplm.cprestudio.ACTION_START"
        const val ACTION_STOP = "com.fliplm.cprestudio.ACTION_STOP"
        const val ACTION_REFRESH = "com.fliplm.cprestudio.ACTION_REFRESH"
        const val ACTION_TEST_SOUND = "com.fliplm.cprestudio.ACTION_TEST_SOUND"
        const val ACTION_APP_FOREGROUND = "com.fliplm.cprestudio.ACTION_APP_FOREGROUND"
        const val ACTION_APP_BACKGROUND = "com.fliplm.cprestudio.ACTION_APP_BACKGROUND"

        private const val CHANNEL_ID = "professor_overlay_channel"
        private const val NOTIFICATION_ID = 4201
        private const val POLL_INTERVAL_MS = 180_000L

        @Volatile
        var isRunning: Boolean = false

        @Volatile
        var isAppInForeground: Boolean = false
    }
}
