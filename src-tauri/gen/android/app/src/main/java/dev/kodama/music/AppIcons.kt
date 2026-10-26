package dev.kodama.music

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/**
 * The launcher icon the user picked (settings: Appearance > App icon). Android has no way to
 * change an app's icon, so the manifest lists the launcher entry once per icon as an
 * activity-alias (".IconStandardPink" and so on) and exactly one of them is enabled.
 *
 * Switching ends the app: HyperOS kills the process when the entry it was started from goes
 * off, DONT_KILL_APP or not, and the music with it. So a pick is noted (request) and carried
 * out once Kodama is out of sight with nothing playing (applyIfIdle, from MainActivity.onStop
 * and from a pause in the background); "Apply now" in the settings does it at once (select).
 */
object AppIcons {
  private const val PREFS = "app_icon"
  private const val PENDING = "pending"

  fun request(context: Context, slug: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PENDING, slug).apply()
  }

  fun pending(context: Context): String? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PENDING, null)

  /** The noted icon, if there is one, while the app is in the background and silent. */
  fun applyIfIdle(context: Context) {
    val slug = pending(context) ?: return
    if (!MainActivity.inBackground || MediaBridge.isPlaying()) return
    select(context, slug)
  }

  /** "3d_pink" -> "dev.kodama.music.Icon3dPink", the names the manifest gives the aliases. */
  private fun aliasName(context: Context, slug: String) =
    context.packageName + ".Icon" + slug.split('_').joinToString("") { it.replaceFirstChar(Char::titlecase) }

  fun select(context: Context, slug: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PENDING).commit()
    val pm = context.packageManager
    val target = aliasName(context, slug)
    val aliases = pm.getPackageInfo(
      context.packageName,
      PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS,
    ).activities.orEmpty().filter { it.targetActivity != null && it.name.startsWith(context.packageName + ".Icon") }
    if (aliases.none { it.name == target }) return
    // The new one on before the old one off, so the launcher is never left without an entry.
    pm.setComponentEnabledSetting(ComponentName(context, target),
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
    for (a in aliases) if (a.name != target) {
      pm.setComponentEnabledSetting(ComponentName(context, a.name),
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
    }
  }
}
