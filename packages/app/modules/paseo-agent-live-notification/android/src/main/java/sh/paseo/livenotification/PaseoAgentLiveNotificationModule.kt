package sh.paseo.livenotification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

private const val CHANNEL_ID = "paseo-agent-live"
private const val NOTIFICATION_ID = 0x50415345
private const val TAP_EVENT = "onAgentLiveNotificationTap"
private const val SERVER_ID = "sh.paseo.livenotification.SERVER_ID"
private const val AGENT_ID = "sh.paseo.livenotification.AGENT_ID"

class PaseoAgentLiveNotificationModule : Module() {
  private val pendingTap = AtomicReference<Bundle?>()

  override fun definition() = ModuleDefinition {
    Name("PaseoAgentLiveNotification")
    Events(TAP_EVENT)

    OnCreate {
      // A prior Android process may have died before it could cancel its notification.
      appContext.reactContext?.getSystemService(NotificationManager::class.java)
        ?.cancel(NOTIFICATION_ID)
    }

    Function("publish") { serverId: String, agentId: String, titles: List<String>, total: Int ->
      val context = appContext.reactContext ?: return@Function false
      publish(context, serverId, agentId, titles, total)
    }

    Function("clear") {
      appContext.reactContext?.getSystemService(NotificationManager::class.java)
        ?.cancel(NOTIFICATION_ID)
      Unit
    }

    OnStartObserving(TAP_EVENT) {
      pendingTap.get()?.let { sendEvent(TAP_EVENT, it) }
    }

    OnNewIntent { intent ->
      consumeTap(intent)?.let {
        pendingTap.set(it)
        sendEvent(TAP_EVENT, it)
      }
    }

    Function("takeLaunchTap") {
      pendingTap.get() ?: appContext.currentActivity?.intent?.let(::consumeTap)
    }

    Function("acknowledgeTap") { id: String ->
      val tap = pendingTap.get()
      if (tap?.getString("id") == id) pendingTap.compareAndSet(tap, null)
      Unit
    }
  }

  private fun publish(
    context: Context,
    serverId: String,
    agentId: String,
    titles: List<String>,
    total: Int,
  ): Boolean {
    if (titles.isEmpty() || total < titles.size) return false
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    if (!manager.areNotificationsEnabled()) return false

    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.paseo_agent_live_channel),
      NotificationManager.IMPORTANCE_LOW,
    )
    manager.createNotificationChannel(channel)
    if (manager.getNotificationChannel(CHANNEL_ID)?.importance == NotificationManager.IMPORTANCE_NONE) {
      return false
    }

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: return false
    launchIntent.action = "${context.packageName}.OPEN_AGENT_LIVE_NOTIFICATION"
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    launchIntent.putExtra(SERVER_ID, serverId).putExtra(AGENT_ID, agentId)
    val tap = PendingIntent.getActivity(
      context,
      NOTIFICATION_ID,
      launchIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val iconId = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon
    val headline = context.resources.getQuantityString(R.plurals.paseo_agent_live_count, total, total)
    val shortText = if (total > 99) "99+" else total.toString()
    val missingTitle = context.getString(R.string.paseo_agent_live_untitled)
    val rows = titles.map { it.ifBlank { missingTitle } }
    val overflow = total - rows.size
    val body = buildList {
      addAll(rows)
      if (overflow > 0) add(context.getString(R.string.paseo_agent_live_overflow, overflow))
    }.joinToString("\n")
    val action = Notification.Action.Builder(
      Icon.createWithResource(context, iconId),
      context.getString(R.string.paseo_agent_live_open),
      tap,
    ).build()
    val extras = Bundle()
    XiaomiIsland.addExtras(context, extras, headline, body, shortText, action)

    val publicSummary = Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(iconId)
      .setContentTitle(headline)
      .setShowWhen(false)
      .build()

    val builder = Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(iconId)
      .setContentTitle(headline)
      .setContentText(rows.first())
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setContentIntent(tap)
      .addAction(action)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setTimeoutAfter(60 * 60 * 1000L)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setPublicVersion(publicSummary)

    if (Build.VERSION.SDK_INT >= 36) {
      builder.setShortCriticalText(shortText)
      // Use the wire key on the base API 36 SDK, which lacks the builder method.
      extras.putBoolean("android.requestPromotedOngoing", true)
    }
    return try {
      manager.notify(NOTIFICATION_ID, builder.addExtras(extras).build())
      true
    } catch (_: SecurityException) {
      // Notification permission can be revoked between the check and post.
      false
    }
  }

  private fun consumeTap(intent: Intent): Bundle? {
    val serverId = intent.getStringExtra(SERVER_ID) ?: return null
    val agentId = intent.getStringExtra(AGENT_ID) ?: return null
    intent.removeExtra(SERVER_ID)
    intent.removeExtra(AGENT_ID)
    return Bundle().apply {
      putString("id", "agent-live:${UUID.randomUUID()}")
      putBundle("data", Bundle().apply {
        putString("serverId", serverId)
        putString("agentId", agentId)
      })
    }
  }
}
