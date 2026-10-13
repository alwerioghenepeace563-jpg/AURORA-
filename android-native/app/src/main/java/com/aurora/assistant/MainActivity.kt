package com.aurora.assistant

import android.os.Bundle
import android.Manifest
import android.content.pm.PackageManager
import android.app.AlarmManager
import android.app.PendingIntent
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.os.Build
import android.os.Environment
import android.content.Intent
import android.content.Context
import android.provider.Settings
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.net.Uri
import android.media.MediaPlayer
import android.graphics.Bitmap
import java.io.ByteArrayOutputStream
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

private val Night = Color(0xFF050812)
private val Panel = Color(0xFF0D1424)
private val Cyan = Color(0xFF62E8FF)
private val Muted = Color(0xFF8D9CB6)

class MainActivity : ComponentActivity() {
    private var pendingInstallUri: Uri? = null
    private var downloadReceiver: BroadcastReceiver? = null
    private val installPermissionLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        val uri = pendingInstallUri
        pendingInstallUri = null
        if (uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && packageManager.canRequestPackageInstalls()) {
            openApkInstaller(uri)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1901)
        }
        downloadReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
                val completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                val prefs = getSharedPreferences("aurora_native", Context.MODE_PRIVATE)
                if (completedId != prefs.getLong("download_id", -2L)) return
                val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                val query = DownloadManager.Query().setFilterById(completedId)
                manager.query(query)?.use { cursor ->
                    if (!cursor.moveToFirst()) return
                    val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                    val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
                    val sizeIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
                    val status = if (statusIndex >= 0) cursor.getInt(statusIndex) else -1
                    val size = if (sizeIndex >= 0) cursor.getLong(sizeIndex) else 0L
                    if (status != DownloadManager.STATUS_SUCCESSFUL || size <= 0L) {
                        android.widget.Toast.makeText(
                            context,
                            "AURORA update download failed. Please check your connection and try again.",
                            android.widget.Toast.LENGTH_LONG
                        ).show()
                        return
                    }
                }
                val uri = manager.getUriForDownloadedFile(completedId)
                if (uri != null) openApkInstaller(uri)
                else android.widget.Toast.makeText(context, "AURORA downloaded, but Android could not open the APK.", android.widget.Toast.LENGTH_LONG).show()
            }
        }
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else registerReceiver(downloadReceiver, filter)
        setContent { AuroraNativeApp() }
    }

    override fun onDestroy() {
        downloadReceiver?.let { runCatching { unregisterReceiver(it) } }
        downloadReceiver = null
        super.onDestroy()
    }

    fun downloadAuroraUpdate(url: String): Boolean {
        if (!url.startsWith("https://")) return false
        return try {
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle("AURORA update")
                .setDescription("Downloading the signed AURORA Android update")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "AURORA-update.apk")
            val id = (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            getSharedPreferences("aurora_native", Context.MODE_PRIVATE).edit().putLong("download_id", id).apply()
            true
        } catch (_: Exception) { false }
    }

    private fun openApkInstaller(uri: Uri) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            pendingInstallUri = uri
            installPermissionLauncher.launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            return
        }
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}

@Composable
private fun AuroraNativeApp() {
    var page by remember { mutableStateOf("Home") }
    var latestVersion by remember { mutableStateOf<String?>(null) }
    var releaseNotes by remember { mutableStateOf("") }
    var releaseUrl by remember { mutableStateOf("") }
    var updateMessage by remember { mutableStateOf("Save your deployed AURORA URL in Profile → AI connection to check the latest release.") }
    var checking by remember { mutableStateOf(false) }
    var apkAvailable by remember { mutableStateOf(false) }
    var updateAvailable by remember { mutableStateOf(false) }
    var downloadBusy by remember { mutableStateOf(false) }
    var downloadMessage by remember { mutableStateOf("") }
    val context = LocalContext.current
    val installedVersion = remember { runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "0.1.0" }
    val prefs = remember { context.getSharedPreferences("aurora_native", android.content.Context.MODE_PRIVATE) }
    var backendUrl by remember { mutableStateOf(prefs.getString("backend_url", "") ?: "") }
    var draft by remember { mutableStateOf("") }
    var chatBusy by remember { mutableStateOf(false) }
    var chatError by remember { mutableStateOf("") }
    var chatMessages by remember { mutableStateOf(loadNativeHistory(prefs)) }
    var pendingAttachment by remember { mutableStateOf<JSONObject?>(null) }
    var attachmentLabel by remember { mutableStateOf("") }
    var activityKind by remember { mutableStateOf("Tasks") }
    var activityTitle by remember { mutableStateOf("") }
    var activityBody by remember { mutableStateOf("") }
    var reminderDelayMinutes by remember { mutableStateOf("10") }
    var activityItems by remember { mutableStateOf(loadActivityItems(prefs)) }
    var toolKind by remember { mutableStateOf("Search") }
    var toolInput by remember { mutableStateOf("") }
    var toolResult by remember { mutableStateOf("") }
    var toolBusy by remember { mutableStateOf(false) }
    var timerMinutes by remember { mutableStateOf("10") }
    var timerSeconds by remember { mutableStateOf(0) }
    var timerRunning by remember { mutableStateOf(false) }
    var profileName by remember { mutableStateOf(prefs.getString("profile_name", "") ?: "") }
    var profileNickname by remember { mutableStateOf(prefs.getString("profile_nickname", "") ?: "") }
    var profileWakeTime by remember { mutableStateOf(prefs.getString("profile_wake_time", "") ?: "") }
    var profileSleepTime by remember { mutableStateOf(prefs.getString("profile_sleep_time", "") ?: "") }
    var profilePriorities by remember { mutableStateOf(prefs.getString("profile_priorities", "") ?: "") }
    var profileFood by remember { mutableStateOf(prefs.getString("profile_food", "") ?: "") }
    var profileRestrictions by remember { mutableStateOf(prefs.getString("profile_restrictions", "") ?: "") }
    var assistantStyle by remember { mutableStateOf(prefs.getString("assistant_style", "warm") ?: "warm") }
    var preferredProvider by remember { mutableStateOf(prefs.getString("preferred_provider", "") ?: "") }
    var voiceRepliesEnabled by remember { mutableStateOf(prefs.getBoolean("voice_replies", true)) }
    var selectedVoice by remember { mutableStateOf(prefs.getString("selected_voice", "jessica") ?: "jessica") }
    val scope = rememberCoroutineScope()
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) {
            val output = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 88, output)
            val encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
            pendingAttachment = JSONObject().put("mimeType", "image/jpeg").put("data", encoded)
            attachmentLabel = "camera-photo.jpg"
            draft = "Please examine this photo and describe what is important. Read any visible text and help me understand it."
            chatError = ""
            page = "Jarvis"
        } else chatError = "No photo was captured."
    }
    val documentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                val result = withContext(Dispatchers.IO) { readNativeAttachment(context, uri) }
                if (result == null) {
                    chatError = "Could not read that file, or it exceeds the current size limit."
                } else if (result.mimeType.startsWith("image/")) {
                    pendingAttachment = JSONObject().put("mimeType", result.mimeType).put("data", result.base64.orEmpty())
                    attachmentLabel = result.name
                    draft = "Please examine this image and describe what is important. Read any visible text and help me understand it. Image: ${result.name}"
                    chatError = ""
                    page = "Jarvis"
                } else if (result.mimeType == "application/pdf") {
                    pendingAttachment = JSONObject().put("mimeType", result.mimeType).put("data", result.base64.orEmpty())
                    attachmentLabel = result.name
                    draft = "Please read this PDF document: ${result.name}. Summarise its key points, explain difficult parts, and answer questions using the document."
                    chatError = ""
                    page = "Jarvis"
                } else if (!result.text.isNullOrBlank()) {
                    pendingAttachment = null
                    attachmentLabel = result.name
                    draft = "Please help me analyse this attached file: ${result.name}\n\n--- FILE CONTENT ---\n${result.text.take(12000)}"
                    chatError = "Text file attached. Review the message and tap Send."
                    page = "Jarvis"
                } else {
                    chatError = "AURORA supports JPEG, PNG, WebP, PDF, TXT, Markdown, CSV and JSON files."
                }
            }
        }
    }
    val speechLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val spoken = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (!spoken.isNullOrBlank()) { draft = spoken; page = "Jarvis" }
    }
    LaunchedEffect(chatMessages) { saveNativeHistory(prefs, chatMessages) }
    LaunchedEffect(timerRunning, timerSeconds) {
        if (timerRunning && timerSeconds > 0) {
            delay(1000)
            timerSeconds -= 1
        } else if (timerSeconds == 0) timerRunning = false
    }
    LaunchedEffect(activityItems) { saveActivityItems(prefs, activityItems) }

    MaterialTheme(colorScheme = darkColorScheme(
        background = Night, surface = Panel, primary = Cyan,
        onBackground = Color.White, onSurface = Color.White
    )) {
        Column(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(listOf(Color(0xFF0A1325), Night, Color(0xFF03050A)))
            ).padding(horizontal = 22.dp, vertical = 18.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Box(Modifier.size(32.dp).border(1.dp, Cyan.copy(alpha = .7f), RoundedCornerShape(11.dp)), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(9.dp).clip(CircleShape).background(Cyan))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("AURORA", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, letterSpacing = 4.sp)
                    Text("YOUR PERSONAL AI", color = Muted, fontSize = 8.sp, letterSpacing = 2.sp)
                }
                Text("◉", color = Cyan, fontSize = 16.sp, modifier = Modifier.clip(CircleShape).clickable { page = "Profile" }.padding(10.dp))
            }
            Spacer(Modifier.height(12.dp))
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (page) {
                    "Updates" -> {
                        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                            Text("APP UPDATES", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(8.dp))
                            Text("Keep AURORA current", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(18.dp))
                            Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(22.dp)) {
                                Column(Modifier.fillMaxWidth().padding(18.dp)) {
                                    Text("Installed version", color = Muted, fontSize = 12.sp)
                                    Text("$installedVersion · Native Android", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                                    Spacer(Modifier.height(18.dp))
                                    Text("Latest release", color = Muted, fontSize = 12.sp)
                                    Text(latestVersion ?: "Not checked yet", color = Color.White, fontSize = 18.sp)
                                    if (latestVersion != null) {
                                        Spacer(Modifier.height(6.dp))
                                        Text(if (updateAvailable) "A newer version is available" else "You are up to date", color = if (updateAvailable) Cyan else Muted, fontSize = 12.sp)
                                    }
                                    if (releaseNotes.isNotBlank()) {
                                        Spacer(Modifier.height(12.dp))
                                        Text("What's new", color = Cyan, fontWeight = FontWeight.SemiBold)
                                        Spacer(Modifier.height(4.dp))
                                        Text(releaseNotes, color = Muted, fontSize = 13.sp)
                                    }
                                    Spacer(Modifier.height(18.dp))
                                    Button(onClick = {
                                        checking = true
                                        updateMessage = "Checking the official AURORA releases…"
                                        scope.launch {
                                            val result = withContext(Dispatchers.IO) { checkLatestRelease(backendUrl.trim().trimEnd('/')) }
                                            latestVersion = result?.optString("tag_name")?.takeIf { it.isNotBlank() }
                                            updateAvailable = latestVersion?.let { isNewerNativeVersion(installedVersion, it) } ?: false
                                            releaseNotes = result?.optString("body")?.take(1400).orEmpty()
                                            releaseUrl = result?.optString("html_url").orEmpty()
                                            val assets = result?.optJSONArray("assets")
                                            val hasApk = assets != null && (0 until assets.length()).any { assets.optJSONObject(it)?.optString("name")?.endsWith(".apk", ignoreCase = true) == true }
                                            apkAvailable = hasApk
                                            updateMessage = if (result == null) "Couldn't reach the release service. Check your app URL and server-side AURORA_GITHUB_TOKEN."
                                            else if (hasApk) "Release found with an APK asset. Use Download and install update below; Android will ask you to approve installation."
                                            else "Release found, but no downloadable APK asset is attached yet."
                                            checking = false
                                        }
                                    }, enabled = !checking, modifier = Modifier.fillMaxWidth(),
                                        colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night)) {
                                        Text(if (checking) "Checking…" else "Check for updates", fontWeight = FontWeight.Bold)
                                    }
                                    if (releaseUrl.isNotBlank()) {
                                        Spacer(Modifier.height(10.dp))
                                        OutlinedButton(onClick = {
                                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(releaseUrl))) }
                                                .onFailure { updateMessage = "Could not open the release page on this device." }
                                        }, modifier = Modifier.fillMaxWidth()) { Text("Open release page") }
                                    }
                                    if (apkAvailable && updateAvailable) {
                                        Spacer(Modifier.height(10.dp))
                                        Button(onClick = {
                                            if (!downloadBusy) {
                                                downloadBusy = true
                                                downloadMessage = "Preparing secure APK download…"
                                                scope.launch {
                                                    val urlResult = withContext(Dispatchers.IO) { getLatestApkDownloadUrl(backendUrl.trim().trimEnd('/')) }
                                                    downloadBusy = false
                                                    if (urlResult.first && urlResult.second.isNotBlank()) {
                                                        val started = (context as? MainActivity)?.downloadAuroraUpdate(urlResult.second) == true
                                                        downloadMessage = if (started) "Download started. Android will notify you when it is ready to install." else "Could not start the download on this device."
                                                    } else downloadMessage = urlResult.second.ifBlank { "Could not prepare the APK download." }
                                                }
                                            }
                                        }, enabled = !downloadBusy, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night)) {
                                            Text(if (downloadBusy) "Preparing…" else "Download and install update", fontWeight = FontWeight.Bold)
                                        }
                                    }
                                    if (downloadMessage.isNotBlank()) {
                                        Spacer(Modifier.height(8.dp))
                                        Text(downloadMessage, color = Muted, fontSize = 12.sp)
                                    }
                                    Spacer(Modifier.height(10.dp))
                                    Text(updateMessage, color = Muted, fontSize = 12.sp)
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Text("Updates require a published signed APK and server-side AURORA_GITHUB_TOKEN. Android always asks you to approve installation.", color = Muted, fontSize = 12.sp)
                        }
                    }
                    "Activities" -> {
                        Column(Modifier.fillMaxSize()) {
                            Text("YOUR WORKSPACE", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(6.dp))
                            Text("Activities", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                                listOf("Tasks", "Notes", "Reminders", "Events").forEach { kind ->
                                    SuggestionChip(kind, activityKind == kind) { activityKind = kind }
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(18.dp)) {
                                Column(Modifier.fillMaxWidth().padding(14.dp)) {
                                    OutlinedTextField(value = activityTitle, onValueChange = { activityTitle = it }, label = { Text(when(activityKind) { "Tasks" -> "Task"; "Notes" -> "Note title"; "Reminders" -> "Reminder"; else -> "Event" }) }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                                    if (activityKind == "Notes") {
                                        Spacer(Modifier.height(8.dp))
                                        OutlinedTextField(value = activityBody, onValueChange = { activityBody = it }, label = { Text("Note") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), minLines = 2)
                                    }
                                    if (activityKind == "Reminders") {
                                        Spacer(Modifier.height(8.dp))
                                        OutlinedTextField(value = reminderDelayMinutes, onValueChange = { value -> reminderDelayMinutes = value.filter(Char::isDigit).take(5) }, label = { Text("Remind me in how many minutes?") }, supportingText = { Text("1–43200 minutes (up to 30 days)") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                                    }
                                    Spacer(Modifier.height(10.dp))
                                    Button(onClick = {
                                        val title = activityTitle.trim()
                                        if (title.isNotBlank()) {
                                            val now = System.currentTimeMillis()
                                            val delayMinutes = reminderDelayMinutes.toLongOrNull()
                                            if (activityKind == "Reminders" && (delayMinutes == null || delayMinutes !in 1L..43200L)) {
                                                android.widget.Toast.makeText(context, "Choose a reminder time from 1 to 43200 minutes.", android.widget.Toast.LENGTH_LONG).show()
                                            } else {
                                                activityItems = activityItems + NativeActivityItem(activityKind, title, activityBody.trim(), now)
                                                if (activityKind == "Reminders" && delayMinutes != null) {
                                                    scheduleAuroraReminder(context, title, now + delayMinutes * 60_000L)
                                                    android.widget.Toast.makeText(context, "Reminder saved and scheduled.", android.widget.Toast.LENGTH_SHORT).show()
                                                }
                                                activityTitle = ""; activityBody = ""
                                            }
                                        }
                                    }, enabled = activityTitle.isNotBlank(), modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night)) {
                                        Text("Save ${activityKind.removeSuffix("s")}", fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Text("SAVED ${activityKind.uppercase()}", color = Muted, fontSize = 10.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(8.dp))
                            val filteredItems = activityItems.filter { it.kind == activityKind }.sortedByDescending { it.createdAt }
                            if (filteredItems.isEmpty()) {
                                Text("Nothing saved here yet. Add your first ${activityKind.lowercase().removeSuffix("s")} above.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 12.dp))
                            } else {
                                LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(filteredItems) { item ->
                                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Panel).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Column(Modifier.weight(1f)) {
                                                Text(item.title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                                if (item.body.isNotBlank()) { Spacer(Modifier.height(4.dp)); Text(item.body, color = Muted, fontSize = 12.sp) }
                                            }
                                            Text("×", color = Muted, fontSize = 20.sp, modifier = Modifier.clickable { activityItems = activityItems.filterNot { it.id == item.id } }.padding(8.dp))
                                        }
                                    }
                                }
                            }
                            Spacer(Modifier.height(4.dp))
                            NativeActionCard("Focus timer", "Start a simple focus session") { page = "Timer" }
                            Spacer(Modifier.height(10.dp))
                            NativeActionCard("Open tools workspace", "Web search, weather and calculator") { page = "Tools" }
                        }
                    }
                    "Timer" -> {
                        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("FOCUS MODE", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(8.dp))
                            Text("Focus timer", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(28.dp))
                            NativeOrb(190.dp)
                            Spacer(Modifier.height(20.dp))
                            val displayMinutes = timerSeconds / 60
                            val displaySeconds = timerSeconds % 60
                            Text(if (timerSeconds > 0) "%02d:%02d".format(displayMinutes, displaySeconds) else "${timerMinutes.toIntOrNull()?.coerceIn(1, 180) ?: 10}:00", color = Color.White, fontSize = 42.sp, fontWeight = FontWeight.Light)
                            Spacer(Modifier.height(10.dp))
                            Text(if (timerRunning) "STAY IN YOUR FLOW" else if (timerSeconds == 0) "READY WHEN YOU ARE" else "TIMER PAUSED", color = Muted, fontSize = 10.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(22.dp))
                            OutlinedTextField(value = timerMinutes, onValueChange = { value -> if (value.length <= 3 && value.all { it.isDigit() }) timerMinutes = value }, label = { Text("Duration in minutes (1–180)") }, singleLine = true, enabled = !timerRunning && timerSeconds == 0, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp))
                            Spacer(Modifier.height(14.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Button(onClick = {
                                    if (timerSeconds == 0) timerSeconds = (timerMinutes.toIntOrNull() ?: 10).coerceIn(1, 180) * 60
                                    timerRunning = true
                                }, enabled = !timerRunning, colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night), modifier = Modifier.weight(1f)) { Text(if (timerSeconds > 0) "Resume" else "Start") }
                                OutlinedButton(onClick = { timerRunning = false }, enabled = timerRunning, modifier = Modifier.weight(1f)) { Text("Pause") }
                                OutlinedButton(onClick = { timerRunning = false; timerSeconds = 0 }, modifier = Modifier.weight(1f)) { Text("Reset") }
                            }
                            if (timerSeconds == 0 && !timerRunning && timerMinutes.toIntOrNull() != null) {
                                Spacer(Modifier.height(12.dp))
                                Text("When the timer reaches zero, your focus session is complete.", color = Muted, fontSize = 12.sp)
                            }
                        }
                    }
                    "Tools" -> {
                        Column(Modifier.fillMaxSize()) {
                            Text("AURORA UTILITIES", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(6.dp))
                            Text("Tools workspace", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                                listOf("Search", "Weather", "Calculator", "Convert").forEach { kind -> SuggestionChip(kind, toolKind == kind) { toolKind = kind; toolResult = "" } }
                            }
                            Spacer(Modifier.height(12.dp))
                            OutlinedTextField(value = toolInput, onValueChange = { toolInput = it }, label = { Text(when(toolKind) { "Search" -> "What should I search for?"; "Weather" -> "City or town"; "Calculator" -> "Math expression (e.g. 12*(4+3))"; else -> "e.g. 10 km to miles or 32 f to c" }) }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), minLines = if (toolKind == "Calculator") 1 else 2)
                            Spacer(Modifier.height(10.dp))
                            Button(onClick = {
                                val query = toolInput.trim()
                                if (query.isNotBlank() && !toolBusy) {
                                    toolBusy = true; toolResult = ""
                                    scope.launch {
                                        val result = withContext(Dispatchers.IO) { runNativeTool(backendUrl.trim().trimEnd('/'), toolKind, query) }
                                        toolResult = result
                                        toolBusy = false
                                    }
                                }
                            }, enabled = toolInput.isNotBlank() && !toolBusy, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night)) {
                                Text(if (toolBusy) "Working…" else "Run ${toolKind.lowercase()}", fontWeight = FontWeight.Bold)
                            }
                            if (toolResult.isNotBlank()) {
                                Spacer(Modifier.height(12.dp))
                                Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(16.dp)) {
                                    Text(toolResult, color = Color.White, fontSize = 13.sp, modifier = Modifier.fillMaxWidth().padding(14.dp))
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Text("Search and weather use your deployed AURORA backend. Calculator runs locally on the phone.", color = Muted, fontSize = 12.sp)
                        }
                    }
                    "Profile" -> {
                        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                            Text("YOUR SPACE", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(8.dp))
                            Text("Profile & settings", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(8.dp))
                            Text("Your preferences are sent with AI requests and saved on this device.", color = Muted, fontSize = 13.sp)
                            Spacer(Modifier.height(18.dp))
                            OutlinedTextField(value = profileName, onValueChange = { profileName = it }, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp))
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(value = profileNickname, onValueChange = { profileNickname = it }, label = { Text("Preferred name / nickname") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp))
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(value = profileWakeTime, onValueChange = { profileWakeTime = it }, label = { Text("Wake-up time") }, placeholder = { Text("07:00") }, singleLine = true, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp))
                                OutlinedTextField(value = profileSleepTime, onValueChange = { profileSleepTime = it }, label = { Text("Sleep time") }, placeholder = { Text("22:30") }, singleLine = true, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp))
                            }
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(value = profilePriorities, onValueChange = { profilePriorities = it }, label = { Text("Daily priorities") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), maxLines = 2)
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(value = profileFood, onValueChange = { profileFood = it }, label = { Text("Food preferences") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), maxLines = 2)
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(value = profileRestrictions, onValueChange = { profileRestrictions = it }, label = { Text("Dietary restrictions") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), maxLines = 2)
                            Spacer(Modifier.height(8.dp))
                            Text("Assistant style", color = Muted, fontSize = 12.sp)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf("warm", "direct", "detailed", "calm").forEach { style ->
                                    SuggestionChip(style.replaceFirstChar { it.uppercase() }, style == assistantStyle) { assistantStyle = style }
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Panel).clickable {
                                voiceRepliesEnabled = !voiceRepliesEnabled
                                prefs.edit().putBoolean("voice_replies", voiceRepliesEnabled).apply()
                            }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text("Read replies aloud", color = Color.White, fontSize = 14.sp)
                                    Text("Uses AURORA's hosted voice service when available", color = Muted, fontSize = 11.sp)
                                }
                                Checkbox(checked = voiceRepliesEnabled, onCheckedChange = {
                                    voiceRepliesEnabled = it
                                    prefs.edit().putBoolean("voice_replies", it).apply()
                                })
                            }
                            Spacer(Modifier.height(8.dp))
                            Text("Voice", color = Muted, fontSize = 12.sp)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf("jessica", "bella", "lucian").forEach { voice ->
                                    SuggestionChip(voice.replaceFirstChar { it.uppercase() }, voice == selectedVoice) {
                                        selectedVoice = voice
                                        prefs.edit().putString("selected_voice", voice).apply()
                                    }
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            Text("Preferred AI provider", color = Muted, fontSize = 12.sp)
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                                listOf("auto", "groq", "openrouter", "gemini").forEach { provider ->
                                    SuggestionChip(provider.replaceFirstChar { it.uppercase() }, (if (preferredProvider.isBlank()) "auto" else preferredProvider) == provider) {
                                        preferredProvider = if (provider == "auto") "" else provider
                                        prefs.edit().putString("preferred_provider", preferredProvider).apply()
                                    }
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            Button(onClick = {
                                prefs.edit().putString("profile_name", profileName).putString("profile_nickname", profileNickname)
                                    .putString("profile_wake_time", profileWakeTime).putString("profile_sleep_time", profileSleepTime)
                                    .putString("profile_priorities", profilePriorities).putString("profile_food", profileFood)
                                    .putString("profile_restrictions", profileRestrictions).putString("assistant_style", assistantStyle).apply()
                                chatError = "Profile saved on this device."
                            }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night)) { Text("Save profile", fontWeight = FontWeight.Bold) }
                            Spacer(Modifier.height(18.dp))
                            NativeActionCard("AI connection", "Use the existing AURORA /api/chat backend") { page = "Settings" }
                            Spacer(Modifier.height(10.dp))
                            NativeActionCard("App updates", "Check releases and version notes") { page = "Updates" }
                            Spacer(Modifier.height(10.dp))
                            NativeActionCard("Activities", "Your activity and history workspace") { page = "Activities" }
                        }
                    }
                    "Settings" -> {
                        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                            Text("CONNECTION", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(8.dp))
                            Text("Connect AURORA AI", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(8.dp))
                            Text("Enter the HTTPS address of your deployed AURORA web app. The native app will call its existing /api/chat endpoint; API secrets stay on the server.", color = Muted, fontSize = 13.sp)
                            Spacer(Modifier.height(16.dp))
                            OutlinedTextField(value = backendUrl, onValueChange = { backendUrl = it }, label = { Text("AURORA web app URL") }, placeholder = { Text("https://your-aurora-app.vercel.app") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp))
                            Spacer(Modifier.height(12.dp))
                            Button(onClick = {
                                val normalized = backendUrl.trim().trimEnd('/')
                                backendUrl = normalized
                                prefs.edit().putString("backend_url", normalized).apply()
                                chatError = "Connection address saved."
                            }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night)) {
                                Text("Save connection", fontWeight = FontWeight.Bold)
                            }
                            if (chatError.isNotBlank()) { Spacer(Modifier.height(8.dp)); Text(chatError, color = Muted, fontSize = 12.sp) }
                            Spacer(Modifier.height(20.dp))
                            Text("Do not enter API keys here. Keep provider secrets in the secure server environment.", color = Muted, fontSize = 12.sp)
                        }
                    }
                    "Jarvis" -> {
                        Column(Modifier.fillMaxSize()) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                NativeOrb(100.dp)
                                Column(Modifier.weight(1f)) {
                                    Text("AURORA", color = Color.White, fontSize = 23.sp, fontWeight = FontWeight.Light, letterSpacing = 4.sp)
                                    Text(if (backendUrl.isBlank()) "SET UP AI CONNECTION IN PROFILE" else "PERSONAL AI ASSISTANT", color = Muted, fontSize = 9.sp, letterSpacing = 1.sp)
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                if (chatMessages.isEmpty()) item {
                                    Text("Hi, I’m AURORA. Ask me anything. Connect your deployed web app in Profile → AI connection to use your existing AI backend.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 10.dp))
                                }
                                items(chatMessages) { message ->
                                    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (message.first == "user") Alignment.End else Alignment.Start) {
                                        Text(if (message.first == "user") "YOU" else "AURORA", color = Cyan, fontSize = 9.sp, letterSpacing = 1.sp)
                                        Spacer(Modifier.height(4.dp))
                                        Surface(color = if (message.first == "user") Color(0xFF123044) else Panel, shape = RoundedCornerShape(16.dp)) {
                                            Text(message.second, color = Color.White, fontSize = 14.sp, modifier = Modifier.padding(12.dp))
                                        }
                                    }
                                }
                            }
                            if (chatError.isNotBlank()) { Text(chatError, color = Color(0xFFFF9A9A), fontSize = 11.sp, modifier = Modifier.padding(vertical = 5.dp)) }
                            if (attachmentLabel.isNotBlank()) {
                                Text("Attached: $attachmentLabel", color = Cyan, fontSize = 11.sp, modifier = Modifier.padding(bottom = 5.dp))
                            }
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                OutlinedButton(onClick = { documentLauncher.launch(arrayOf("image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json")) }, shape = CircleShape, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 14.dp)) { Text("+") }
                                OutlinedButton(onClick = { runCatching { cameraLauncher.launch(null) }.onFailure { chatError = "Camera isn't available on this device." } }, shape = CircleShape, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 14.dp)) { Text("📷") }
                                OutlinedTextField(value = draft, onValueChange = { draft = it }, placeholder = { Text("Message AURORA…") }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(20.dp), maxLines = 4)
                                OutlinedButton(onClick = {
                                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-NG")
                                        putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak to AURORA")
                                    }
                                    runCatching { speechLauncher.launch(intent) }.onFailure { chatError = "Voice input is not available on this device." }
                                }, shape = CircleShape, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 14.dp)) { Text("🎙") }
                                Button(onClick = {
                                    val prompt = draft.trim()
                                    val base = backendUrl.trim().trimEnd('/')
                                    if (prompt.isNotBlank() && !chatBusy) {
                                        if (!base.startsWith("https://")) chatError = "Open Profile → AI connection and save your deployed HTTPS app URL first."
                                        else {
                                            val history = chatMessages + ("user" to prompt)
                                        chatMessages = history; draft = ""; chatError = ""
                                        val nativeReply = executeNativeCommand(context, prompt)
                                        if (nativeReply != null) {
                                            chatMessages = history + ("assistant" to nativeReply)
                                            chatBusy = false
                                            if (voiceRepliesEnabled && base.startsWith("https://")) {
                                                scope.launch {
                                                    val audioFile = withContext(Dispatchers.IO) { fetchNativeVoice(base, nativeReply, selectedVoice, context.cacheDir) }
                                                    if (audioFile != null) playNativeVoice(audioFile)
                                                }
                                            }
                                        } else {
                                            chatBusy = true
                                            scope.launch {
                                                val outgoingAttachment = pendingAttachment
                                                pendingAttachment = null
                                                attachmentLabel = ""
                                                val result = withContext(Dispatchers.IO) { sendNativeMessage(base, history, nativeProfileJson(profileName, profileNickname, profileWakeTime, profileSleepTime, profilePriorities, profileFood, profileRestrictions, assistantStyle), preferredProvider, outgoingAttachment) }
                                                chatBusy = false
                                                if (result.first) {
                                                    chatMessages = chatMessages + ("assistant" to result.second)
                                                    if (voiceRepliesEnabled) {
                                                        val audioFile = withContext(Dispatchers.IO) { fetchNativeVoice(base, result.second, selectedVoice, context.cacheDir) }
                                                        if (audioFile != null) playNativeVoice(audioFile)
                                                    }
                                                } else chatError = result.second
                                            }
                                        }
                                        }
                                    }
                                }, enabled = !chatBusy && draft.isNotBlank(), colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night), shape = CircleShape, contentPadding = PaddingValues(horizontal = 15.dp, vertical = 14.dp)) {
                                    Text(if (chatBusy) "…" else "Send", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                    else -> {
                        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
                            Spacer(Modifier.height(12.dp))
                            Text("PERSONAL AI • READY WHEN YOU ARE", color = Muted, fontSize = 9.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(8.dp))
                            NativeOrb()
                            Spacer(Modifier.height(6.dp))
                            Text("AURORA", color = Color.White, fontSize = 31.sp, fontWeight = FontWeight.Light, letterSpacing = 8.sp)
                            Spacer(Modifier.height(8.dp))
                            Text("INTELLIGENCE, AT YOUR COMMAND", color = Muted, fontSize = 10.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(24.dp))
                            Card(colors = CardDefaults.cardColors(containerColor = Panel.copy(alpha = .92f)), shape = RoundedCornerShape(22.dp)) {
                                Column(Modifier.fillMaxWidth().padding(18.dp)) {
                                    Text("What can I help with?", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                                    Spacer(Modifier.height(6.dp))
                                    Text("Start a conversation with your personal AI assistant.", color = Muted, fontSize = 12.sp)
                                    Spacer(Modifier.height(14.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        SuggestionChip("Ask anything") { page = "Jarvis"; draft = "" }
                                        SuggestionChip("Open tools") { page = "Activities" }
                                    }
                                    Spacer(Modifier.height(10.dp))
                                    Button(onClick = { page = "Jarvis" }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night)) {
                                        Text("Talk to AURORA", fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0xDD0A1120)).border(1.dp, Color(0x203E83B5), RoundedCornerShape(22.dp)).padding(horizontal = 5.dp, vertical = 7.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                BottomNavItem("Home", "⌂", page == "Home") { page = "Home" }
                BottomNavItem("Activities", "◈", page == "Activities") { page = "Activities" }
                BottomNavItem("Jarvis", "✧", page == "Jarvis") { page = "Jarvis" }
                BottomNavItem("Profile", "◉", page == "Profile" || page == "Settings" || page == "Updates") { page = "Profile" }
            }
            Spacer(Modifier.height(12.dp))
            Text("AURORA • ANDROID", color = Muted.copy(alpha = .7f), fontSize = 10.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        }
    }
}

 
@Composable
private fun NativeActionCard(title: String, subtitle: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel).border(1.dp, Cyan.copy(alpha = .10f), RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(subtitle, color = Muted, fontSize = 12.sp)
        }
        Text("›", color = Cyan, fontSize = 24.sp)
    }
}

@Composable
private fun SuggestionChip(label: String, selected: Boolean = false, onClick: () -> Unit) {
    Text(label, color = if (selected) Night else Cyan, fontSize = 11.sp, modifier = Modifier.clip(RoundedCornerShape(24.dp)).background(if (selected) Cyan else Color.Transparent).border(1.dp, Cyan.copy(alpha = .35f), RoundedCornerShape(24.dp)).clickable(onClick = onClick).padding(horizontal = 11.dp, vertical = 9.dp))
}

@Composable
private fun BottomNavItem(label: String, glyph: String, selected: Boolean, onClick: () -> Unit) {
    Column(Modifier.clip(RoundedCornerShape(15.dp)).clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 7.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(glyph, color = if (selected) Cyan else Muted, fontSize = 18.sp)
        Spacer(Modifier.height(2.dp))
        Text(label, color = if (selected) Color.White else Muted, fontSize = 9.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
    }
}
@Composable
private fun NativeTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        color = if (selected) Night else Muted,
        fontSize = 11.sp,
        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        modifier = Modifier.clip(RoundedCornerShape(30.dp))
            .background(if (selected) Cyan else Panel)
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 10.dp)
    )
}

@Composable
private fun NativeOrb(diameter: androidx.compose.ui.unit.Dp = 238.dp) {
    val transition = rememberInfiniteTransition(label = "aurora-orb")
    val pulse by transition.animateFloat(
        initialValue = 0.92f, targetValue = 1.08f,
        animationSpec = infiniteRepeatable(tween(1900), RepeatMode.Reverse),
        label = "pulse"
    )
    Canvas(Modifier.size(diameter)) {
        val c = Offset(size.width / 2f, size.height / 2f)
        val radius = size.minDimension * .27f * pulse
        drawCircle(Brush.radialGradient(listOf(Cyan.copy(alpha = .28f), Color(0xFF3678FF).copy(alpha = .12f), Color.Transparent), c, size.minDimension * .49f), size.minDimension * .49f, c)
        drawCircle(Brush.radialGradient(listOf(Color(0xFFECFEFF), Color(0xFF9AF1FF), Cyan, Color(0xFF1455A8), Color(0xFF07152B)), c, radius * 1.5f), radius * 1.5f, c)
        drawCircle(Cyan.copy(alpha = .62f), radius * 1.68f, c, style = Stroke(width = 1.2.dp.toPx()))
        rotate(32f, c) {
            drawOval(Cyan.copy(alpha = .46f), topLeft = Offset(c.x - radius * 2.15f, c.y - radius * .72f), size = androidx.compose.ui.geometry.Size(radius * 4.3f, radius * 1.44f), style = Stroke(width = 1.1.dp.toPx()))
        }
        rotate(-32f, c) {
            drawOval(Color(0xFF4B8DFF).copy(alpha = .42f), topLeft = Offset(c.x - radius * 1.9f, c.y - radius * .58f), size = androidx.compose.ui.geometry.Size(radius * 3.8f, radius * 1.16f), style = Stroke(width = 1.dp.toPx()))
        }
        drawCircle(Color.White.copy(alpha = .86f), radius * .32f, Offset(c.x - radius * .35f, c.y - radius * .4f))
        drawCircle(Cyan, radius * .055f, Offset(c.x + radius * 1.48f, c.y - radius * .9f))
        drawCircle(Color(0xFF7B9DFF), radius * .045f, Offset(c.x - radius * 1.42f, c.y + radius * .72f))
    }
}

@Composable
private fun SimplePage(title: String, description: String) {
    Column(Modifier.fillMaxSize().padding(top = 24.dp)) {
        Text(title.uppercase(), color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
        Spacer(Modifier.height(8.dp))
        Text(title, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(12.dp))
        Text(description, color = Muted, fontSize = 14.sp)
    }
}


private fun isNewerNativeVersion(installed: String, latestTag: String): Boolean {
    fun parts(value: String): List<Int> = value.lowercase().removePrefix("aurora-").removePrefix("v")
        .split(".", "-", "+").take(3).map { it.toIntOrNull() ?: 0 }
    val current = parts(installed)
    val latest = parts(latestTag)
    for (i in 0 until 3) {
        val a = current.getOrElse(i) { 0 }
        val b = latest.getOrElse(i) { 0 }
        if (b > a) return true
        if (b < a) return false
    }
    return false
}

private fun checkLatestRelease(baseUrl: String): JSONObject? {
    if (!baseUrl.startsWith("https://")) return null
    return try {
        val connection = (URL("$baseUrl/api/app-update").openConnection() as HttpURLConnection)
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/vnd.github+json")
        connection.setRequestProperty("User-Agent", "AURORA-Android")
        connection.connectTimeout = 10000
        connection.readTimeout = 10000
        try {
            if (connection.responseCode !in 200..299) return null
            JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        } finally {
            connection.disconnect()
        }
    } catch (_: Exception) { null }
}





private fun executeNativeCommand(context: Context, text: String): String? {
    val command = text.trim().lowercase()
    if (command in listOf("open settings", "open phone settings", "open device settings")) {
        return try { context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); "Opening Android Settings." }
        catch (_: Exception) { "I couldn't open Android Settings on this device." }
    }
    if (command in listOf("open camera", "take a photo", "open the camera")) {
        return try { context.startActivity(Intent(MediaStore.ACTION_IMAGE_CAPTURE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); "Opening the camera." }
        catch (_: Exception) { "I couldn't open the camera on this device." }
    }
    val match = Regex("""^(?:please\s+)?open\s+(whatsapp|youtube|chrome|calculator|clock|contacts|maps|gmail|phone|messages)$""").find(command)
        ?: return null
    val app = match.groupValues[1]
    val packages = mapOf(
        "whatsapp" to listOf("com.whatsapp", "com.whatsapp.w4b"),
        "youtube" to listOf("com.google.android.youtube"),
        "chrome" to listOf("com.android.chrome"),
        "calculator" to listOf("com.google.android.calculator", "com.android.calculator2"),
        "clock" to listOf("com.google.android.deskclock", "com.android.deskclock"),
        "contacts" to listOf("com.google.android.contacts", "com.android.contacts"),
        "maps" to listOf("com.google.android.apps.maps"),
        "gmail" to listOf("com.google.android.gm"),
        "phone" to listOf("com.google.android.dialer", "com.android.dialer"),
        "messages" to listOf("com.google.android.apps.messaging", "com.android.messaging")
    )
    for (packageName in packages[app].orEmpty()) {
        val launch = context.packageManager.getLaunchIntentForPackage(packageName)
        if (launch != null) {
            return try { context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); "Opening $app." }
            catch (_: Exception) { "I couldn't open $app on this device." }
        }
    }
    return "I couldn't find $app on this phone. Make sure it is installed, then try again."
}


private fun getLatestApkDownloadUrl(baseUrl: String): Pair<Boolean, String> {
    if (!baseUrl.startsWith("https://")) return false to "Save the deployed HTTPS AURORA URL in Profile → AI connection first."
    return try {
        val connection = (URL("$baseUrl/api/app-update?download=1").openConnection() as HttpURLConnection)
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("User-Agent", "AURORA-Android")
        connection.connectTimeout = 12000
        connection.readTimeout = 20000
        val status = connection.responseCode
        val body = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        val json = runCatching { JSONObject(body) }.getOrNull()
        if (status !in 200..299) false to (json?.optString("error")?.takeIf { it.isNotBlank() } ?: "APK download link request failed (HTTP $status).")
        else {
            val url = json?.optString("download_url").orEmpty()
            if (url.startsWith("https://")) true to url else false to "The release service did not return a secure APK download link."
        }
    } catch (e: Exception) { false to (e.message ?: "Could not prepare the APK download.") }
}

private fun runNativeTool(baseUrl: String, kind: String, query: String): String {
    if (kind == "Calculator") return try { "$query = ${NativeExpressionParser(query).parse()}" } catch (e: Exception) { e.message ?: "Invalid expression." }
    if (kind == "Convert") return nativeConvertUnits(query)
    if (!baseUrl.startsWith("https://")) return "Open Profile → AI connection and save your deployed HTTPS app URL first."
    return try {
        val url = if (kind == "Weather") URL("$baseUrl/api/weather?city=${java.net.URLEncoder.encode(query, "UTF-8")}") else URL("$baseUrl/api/search")
        val connection = (url.openConnection() as HttpURLConnection)
        connection.requestMethod = if (kind == "Search") "POST" else "GET"
        connection.setRequestProperty("Accept", "application/json")
        if (kind == "Search") {
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true
            connection.outputStream.use { it.write(JSONObject().put("query", query).toString().toByteArray(Charsets.UTF_8)) }
        }
        connection.connectTimeout = 12000
        connection.readTimeout = 30000
        val status = connection.responseCode
        val body = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        val json = runCatching { JSONObject(body) }.getOrNull()
        if (status !in 200..299) return json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Tool request failed (HTTP $status)."
        if (kind == "Search") {
            val results = json?.optJSONArray("results") ?: return "No search results returned."
            if (results.length() == 0) return "No matching results. Try a more specific search."
            (0 until minOf(results.length(), 6)).joinToString("\n\n") { i ->
                val item = results.optJSONObject(i) ?: JSONObject()
                "${i + 1}. ${item.optString("title")}\n${item.optString("snippet")}\n${item.optString("url")}"
            }
        } else {
            val current = json?.optJSONObject("current") ?: JSONObject()
            val units = json?.optJSONObject("units") ?: JSONObject()
            "Weather for ${json?.optString("location") ?: query}\nNow: ${current.optString("temperature", "—")}${units.optString("temperature", "°C")}\nConditions: ${current.optString("description", "Unavailable")}\nHumidity: ${current.optString("humidity", "—")}%\nWind: ${current.optString("windSpeed", "—")} ${units.optString("wind", "km/h")}"
        }
    } catch (e: Exception) { e.message ?: "The tool could not complete. Check the connection and try again." }
}


private fun nativeConvertUnits(query: String): String {
    val match = Regex("""^\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Z°]+)\s+(?:to|in)\s+([a-zA-Z°]+)\s*$""").find(query)
        ?: return "Use a format like “10 km to miles”, “5 kg to lb”, or “32 F to C”."
    val value = match.groupValues[1].toDouble()
    val from = match.groupValues[2].lowercase()
    val to = match.groupValues[3].lowercase()
    val converted = when ("$from>$to") {
        "km>mi", "km>mile", "km>miles" -> value * 0.621371
        "mi>km", "mile>km", "miles>km" -> value / 0.621371
        "m>ft", "meter>feet", "metre>feet" -> value * 3.28084
        "ft>m", "feet>meter", "feet>metre" -> value / 3.28084
        "kg>lb", "kg>lbs" -> value * 2.20462
        "lb>kg", "lbs>kg" -> value / 2.20462
        "c>f", "°c>°f" -> value * 9 / 5 + 32
        "f>c", "°f>°c" -> (value - 32) * 5 / 9
        "l>ml" -> value * 1000
        "ml>l" -> value / 1000
        else -> return "That unit pair isn't supported yet. Try km/miles, m/ft, kg/lb, C/F or L/mL."
    }
    return "$value $from = ${"%.6f".format(java.util.Locale.US, converted).trimEnd('0').trimEnd('.') } $to"
}

private class NativeExpressionParser(private val input: String) {
    private var index = 0
    fun parse(): Double {
        val value = expression()
        skipSpaces()
        if (index != input.length) throw IllegalArgumentException("Unexpected character at position ${index + 1}.")
        if (!value.isFinite()) throw IllegalArgumentException("The result is not finite.")
        return value
    }
    private fun expression(): Double {
        var value = term()
        while (true) {
            skipSpaces()
            value = when {
                eat('+') -> value + term()
                eat('-') -> value - term()
                else -> return value
            }
        }
    }
    private fun term(): Double {
        var value = factor()
        while (true) {
            skipSpaces()
            value = when {
                eat('*') -> value * factor()
                eat('/') -> { val divisor = factor(); if (divisor == 0.0) throw IllegalArgumentException("Cannot divide by zero."); value / divisor }
                else -> return value
            }
        }
    }
    private fun factor(): Double {
        skipSpaces()
        if (eat('+')) return factor()
        if (eat('-')) return -factor()
        if (eat('(')) { val value = expression(); skipSpaces(); if (!eat(')')) throw IllegalArgumentException("Missing closing parenthesis."); return value }
        val start = index
        while (index < input.length && (input[index].isDigit() || input[index] == '.')) index++
        if (start == index) throw IllegalArgumentException("Enter a valid arithmetic expression.")
        return input.substring(start, index).toDoubleOrNull() ?: throw IllegalArgumentException("Invalid number.")
    }
    private fun skipSpaces() { while (index < input.length && input[index].isWhitespace()) index++ }
    private fun eat(char: Char): Boolean { if (index < input.length && input[index] == char) { index++; return true }; return false }
}

private fun scheduleAuroraReminder(context: Context, title: String, triggerAtMillis: Long) {
    val intent = Intent(context, AuroraReminderReceiver::class.java).apply {
        putExtra(AuroraReminderReceiver.EXTRA_TITLE, title)
        putExtra(AuroraReminderReceiver.EXTRA_ID, (title + triggerAtMillis).hashCode())
    }
    val requestCode = (title + triggerAtMillis).hashCode()
    val pending = PendingIntent.getBroadcast(
        context, requestCode, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending)
}

private data class NativeActivityItem(val kind: String, val title: String, val body: String, val createdAt: Long) {
    val id: String get() = "$kind-$createdAt-$title"
}

private fun loadActivityItems(prefs: android.content.SharedPreferences): List<NativeActivityItem> {
    return try {
        val array = JSONArray(prefs.getString("activity_items", "[]") ?: "[]")
        (0 until array.length()).mapNotNull { i ->
            val item = array.optJSONObject(i) ?: return@mapNotNull null
            val kind = item.optString("kind")
            val title = item.optString("title")
            if (kind !in listOf("Tasks", "Notes", "Reminders", "Events") || title.isBlank()) null
            else NativeActivityItem(kind, title, item.optString("body"), item.optLong("createdAt"))
        }
    } catch (_: Exception) { emptyList() }
}

private fun saveActivityItems(prefs: android.content.SharedPreferences, items: List<NativeActivityItem>) {
    val array = JSONArray()
    items.takeLast(500).forEach { item ->
        array.put(JSONObject().put("kind", item.kind).put("title", item.title).put("body", item.body).put("createdAt", item.createdAt))
    }
    prefs.edit().putString("activity_items", array.toString()).apply()
}


private data class NativeAttachment(val name: String, val mimeType: String, val base64: String? = null, val text: String? = null)

private fun readNativeAttachment(context: Context, uri: Uri): NativeAttachment? {
    return try {
        var name = "attachment"
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) name = cursor.getString(index) ?: name
            }
        }
        var mime = context.contentResolver.getType(uri).orEmpty().lowercase()
        if (mime.isBlank()) mime = when (name.substringAfterLast('.', "").lowercase()) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "webp" -> "image/webp"
            "pdf" -> "application/pdf"
            "md" -> "text/markdown"
            "csv" -> "text/csv"
            "json" -> "application/json"
            else -> "text/plain"
        }
        val maxBytes = when {
            mime in listOf("image/jpeg", "image/png", "image/webp") -> 3200000
            mime == "application/pdf" || name.endsWith(".pdf", true) -> 6500000
            mime in listOf("text/plain", "text/markdown", "text/csv", "application/json") ||
                name.matches(Regex(""".+\\.(txt|md|csv|json)$""", RegexOption.IGNORE_CASE)) -> 60000
            else -> return null
        }
        // Enforce the limit while streaming so a huge file cannot be fully loaded into RAM first.
        val output = ByteArrayOutputStream(minOf(maxBytes, 65536))
        context.contentResolver.openInputStream(uri)?.use { input ->
            val buffer = ByteArray(8192)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                if (total > maxBytes) return null
                output.write(buffer, 0, count)
            }
        } ?: return null
        val bytes = output.toByteArray()
        if (mime.startsWith("image/")) {
            if (mime !in listOf("image/jpeg", "image/png", "image/webp")) return null
            NativeAttachment(name, mime, base64 = Base64.encodeToString(bytes, Base64.NO_WRAP))
        } else if (mime == "application/pdf" || name.endsWith(".pdf", true)) {
            NativeAttachment(name, "application/pdf", base64 = Base64.encodeToString(bytes, Base64.NO_WRAP))
        } else {
            NativeAttachment(name, mime, text = bytes.toString(Charsets.UTF_8))
        }
    } catch (_: Exception) { null }
}

private fun nativeProfileJson(name: String, nickname: String, wakeTime: String, sleepTime: String, priorities: String, food: String, restrictions: String, style: String): JSONObject {
    return JSONObject().put("name", name).put("nickname", nickname).put("wakeTime", wakeTime).put("sleepTime", sleepTime).put("priorities", priorities)
        .put("foodPreferences", food).put("dietaryRestrictions", restrictions).put("assistantStyle", style)
}

private fun loadNativeHistory(prefs: android.content.SharedPreferences): List<Pair<String, String>> {
    return try {
        val array = JSONArray(prefs.getString("chat_history", "[]") ?: "[]")
        (0 until array.length()).mapNotNull { i ->
            val item = array.optJSONObject(i) ?: return@mapNotNull null
            val role = item.optString("role")
            val content = item.optString("content")
            if (role in listOf("user", "assistant") && content.isNotBlank()) role to content else null
        }.takeLast(80)
    } catch (_: Exception) { emptyList() }
}

private fun saveNativeHistory(prefs: android.content.SharedPreferences, history: List<Pair<String, String>>) {
    val array = JSONArray()
    history.takeLast(80).forEach { (role, content) -> array.put(JSONObject().put("role", role).put("content", content)) }
    prefs.edit().putString("chat_history", array.toString()).apply()
}


private fun fetchNativeVoice(baseUrl: String, text: String, voice: String, cacheDir: java.io.File): java.io.File? {
    return try {
        val connection = (URL("$baseUrl/api/voice").openConnection() as HttpURLConnection)
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("Accept", "audio/*")
        connection.connectTimeout = 15000
        connection.readTimeout = 60000
        connection.doOutput = true
        val payload = JSONObject().put("text", text.take(2500)).put("voice", voice)
        connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        if (connection.responseCode !in 200..299) {
            connection.disconnect()
            return null
        }
        val file = java.io.File.createTempFile("aurora-voice-", ".mp3", cacheDir)
        connection.inputStream.use { input -> file.outputStream().use { output -> input.copyTo(output) } }
        connection.disconnect()
        if (file.length() > 0) file else null
    } catch (_: Exception) { null }
}

private fun playNativeVoice(file: java.io.File) {
    try {
        val player = MediaPlayer()
        player.setDataSource(file.absolutePath)
        player.setOnPreparedListener { it.start() }
        player.setOnCompletionListener { it.release(); file.delete() }
        player.setOnErrorListener { mp, _, _ -> mp.release(); file.delete(); true }
        player.prepareAsync()
    } catch (_: Exception) { file.delete() }
}

private fun sendNativeMessage(baseUrl: String, history: List<Pair<String, String>>, profile: JSONObject, preferredProvider: String, attachment: JSONObject? = null): Pair<Boolean, String> {
    return try {
        val messages = JSONArray()
        history.takeLast(20).forEach { (role, content) -> messages.put(JSONObject().put("role", role).put("content", content)) }
        if (attachment != null && messages.length() > 0) {
            val last = messages.optJSONObject(messages.length() - 1)
            if (last != null) last.put(if (attachment.optString("mimeType").startsWith("image/")) "image" else "document", attachment)
        }
        val payload = JSONObject().put("messages", messages).put("profile", profile).apply { if (preferredProvider.isNotBlank()) put("preferredProvider", preferredProvider) }
        val connection = (URL("$baseUrl/api/chat").openConnection() as HttpURLConnection)
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("Accept", "application/json")
        connection.connectTimeout = 15000
        connection.readTimeout = 60000
        connection.doOutput = true
        connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        val json = runCatching { JSONObject(body) }.getOrNull()
        if (status !in 200..299) false to (json?.optString("error")?.takeIf { it.isNotBlank() } ?: "AI service returned HTTP $status. Check the web deployment logs.")
        else true to (json?.optString("reply")?.takeIf { it.isNotBlank() } ?: "AURORA returned an empty response.")
    } catch (e: Exception) { false to (e.message ?: "Could not reach the AURORA AI service. Check your connection and URL.") }
}
