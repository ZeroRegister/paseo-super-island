package sh.paseo.livenotification

import android.app.Notification
import android.content.Context
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject

internal object XiaomiIsland {
  private const val ICON = "miui.focus.pic_paseo"
  private const val OPEN_SESSION = "miui.focus.action_open_session"

  fun addExtras(
    context: Context,
    extras: Bundle,
    headline: String,
    body: String,
    shortCount: String,
    openSession: Notification.Action,
  ) {
    if (Build.MANUFACTURER.lowercase() !in setOf("xiaomi", "redmi", "poco")) return

    val appIcon = Icon.createWithResource(context, context.applicationInfo.icon)
    extras.putBundle("miui.focus.pics", Bundle().apply { putParcelable(ICON, appIcon) })
    extras.putBundle("miui.focus.actions", Bundle().apply {
      putParcelable(OPEN_SESSION, openSession)
    })

    val picture = JSONObject().put("type", 1).put("pic", ICON)
    val island = JSONObject()
      .put("islandProperty", 1)
      .put("bigIslandArea", JSONObject().put("imageTextInfoLeft", JSONObject()
        .put("type", 1)
        .put("picInfo", picture)
        .put("textInfo", JSONObject().put("title", shortCount))))
      .put("smallIslandArea", JSONObject().put("picInfo", picture))
    val parameters = JSONObject()
      .put("protocol", 1)
      .put("business", "agent_task")
      .put("updatable", true)
      .put("islandFirstFloat", false)
      .put("enableFloat", false)
      .put("timeout", 60)
      .put("ticker", shortCount)
      .put("tickerPic", ICON)
      .put("aodTitle", headline)
      .put("param_island", island)
      .put("baseInfo", JSONObject().put("type", 2).put("title", headline).put("content", body))
      .put("actions", JSONArray().put(JSONObject().put("action", OPEN_SESSION)))
    extras.putString("miui.focus.param", JSONObject().put("param_v2", parameters).toString())
  }
}
