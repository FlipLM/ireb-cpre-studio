package com.fliplm.cprestudio

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.view.View

class ProfessorSpriteView(context: Context) : View(context) {

    private var currentMood: ProfessorMood = ProfessorMood.IDLE
    private var currentFrame: Int = 0
    private val bitmapCache = mutableMapOf<ProfessorMood, Bitmap?>()

    private val spritePaint = Paint().apply {
        isFilterBitmap = false
        isAntiAlias = false
        isDither = false
    }

    private val srcRect = Rect()
    private val dstRect = RectF()

    private val handler = Handler(Looper.getMainLooper())
    private val frameRunnable = object : Runnable {
        override fun run() {
            currentFrame = (currentFrame + 1) % currentMood.frames
            invalidate()
            val delayMs = (1000L / currentMood.fps.coerceAtLeast(1))
            handler.postDelayed(this, delayMs)
        }
    }

    fun setMood(mood: ProfessorMood) {
        if (currentMood == mood) return
        currentMood = mood
        currentFrame = 0
        loadBitmap(mood)
        handler.removeCallbacks(frameRunnable)
        handler.post(frameRunnable)
        invalidate()
    }

    private fun loadBitmap(mood: ProfessorMood): Bitmap? {
        if (bitmapCache.containsKey(mood)) return bitmapCache[mood]
        val bmp = try {
            val opts = BitmapFactory.Options().apply { inScaled = false }
            context.assets.open(mood.assetPath).use { stream ->
                BitmapFactory.decodeStream(stream, null, opts)
            }
        } catch (_: Exception) {
            null
        }
        bitmapCache[mood] = bmp
        return bmp
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        loadBitmap(currentMood)
        handler.removeCallbacks(frameRunnable)
        handler.post(frameRunnable)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        handler.removeCallbacks(frameRunnable)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val sheet = loadBitmap(currentMood) ?: return
        val frameWidth = sheet.width / currentMood.frames
        val frameHeight = sheet.height
        val safeFrame = currentFrame % currentMood.frames
        srcRect.set(
            safeFrame * frameWidth,
            0,
            (safeFrame + 1) * frameWidth,
            frameHeight
        )

        val density = resources.displayMetrics.density
        val shakeX = if (currentMood == ProfessorMood.ANGRY_SLAM) {
            when (safeFrame % 3) {
                0 -> -1.8f * density
                1 -> 1.8f * density
                else -> 0f
            }
        } else {
            0f
        }
        val shakeY = if (currentMood == ProfessorMood.ANGRY_SLAM && safeFrame == 3) {
            1.8f * density
        } else {
            0f
        }

        val pad = 2f * density
        dstRect.set(pad + shakeX, pad + shakeY, w - pad + shakeX, h - pad + shakeY)
        canvas.drawBitmap(sheet, srcRect, dstRect, spritePaint)
    }
}
