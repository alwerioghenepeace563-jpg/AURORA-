package com.aurora.assistant

import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.media.MediaPlayer
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
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { AuroraNativeApp() }
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
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("aurora_native", android.content.Context.MODE_PRIVATE) }
    var backendUrl by remember { mutableStateOf(prefs.getString("backend_url", "") ?: "") }
    var draft by remember { mutableStateOf("") }
    var chatBusy by remember { mutableStateOf(false) }
    var chatError by remember { mutableStateOf("") }
    var chatMessages by remember { mutableStateOf(loadNativeHistory(prefs)) }
    var activityKind by remember { mutableStateOf("Tasks") }
    var activityTitle by remember { mutableStateOf("") }
    var activityBody by remember { mutableStateOf("") }
    var activityItems by remember { mutableStateOf(loadActivityItems(prefs)) }
    var toolKind by remember { mutableStateOf("Search") }
    var toolInput by remember { mutableStateOf("") }
    var toolResult by remember { mutableStateOf("") }
    var toolBusy by remember { mutableStateOf(false) }
    var profileName by remember { mutableStateOf(prefs.getString("profile_name", "") ?: "") }
    var profileNickname by remember { mutableStateOf(prefs.getString("profile_nickname", "") ?: "") }
    var profilePriorities by remember { mutableStateOf(prefs.getString("profile_priorities", "") ?: "") }
    var profileFood by remember { mutableStateOf(prefs.getString("profile_food", "") ?: "") }
    var profileRestrictions by remember { mutableStateOf(prefs.getString("profile_restrictions", "") ?: "") }
    var assistantStyle by remember { mutableStateOf(prefs.getString("assistant_style", "warm") ?: "warm") }
    var preferredProvider by remember { mutableStateOf(prefs.getString("preferred_provider", "") ?: "") }
    var voiceRepliesEnabled by remember { mutableStateOf(prefs.getBoolean("voice_replies", true)) }
    var selectedVoice by remember { mutableStateOf(prefs.getString("selected_voice", "jessica") ?: "jessica") }
    val scope = rememberCoroutineScope()
    val speechLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val spoken = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (!spoken.isNullOrBlank()) { draft = spoken; page = "Jarvis" }
    }
    LaunchedEffect(chatMessages) { saveNativeHistory(prefs, chatMessages) }
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
                                    Text("0.1.0 · Native preview", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                                    Spacer(Modifier.height(18.dp))
                                    Text("Latest release", color = Muted, fontSize = 12.sp)
                                    Text(latestVersion ?: "Not checked yet", color = Color.White, fontSize = 18.sp)
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
                                            releaseNotes = result?.optString("body")?.take(1400).orEmpty()
                                            releaseUrl = result?.optString("html_url").orEmpty()
                                            updateMessage = if (result == null) "Couldn't reach the releases service. Check your connection and try again."
                                            else if ((result.optJSONArray("assets")?.length() ?: 0) > 0) "Release found. Open the release page to review its APK and installation notes."
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
                                    Spacer(Modifier.height(10.dp))
                                    Text(updateMessage, color = Muted, fontSize = 12.sp)
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Text("In-app APK installation is part of the release batch. Android will ask you to approve any installation.", color = Muted, fontSize = 12.sp)
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
                                    Spacer(Modifier.height(10.dp))
                                    Button(onClick = {
                                        val title = activityTitle.trim()
                                        if (title.isNotBlank()) {
                                            activityItems = activityItems + NativeActivityItem(activityKind, title, activityBody.trim(), System.currentTimeMillis())
                                            activityTitle = ""; activityBody = ""
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
                            NativeActionCard("Open tools workspace", "Web search, weather and calculator") { page = "Tools" }
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
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
                                            chatMessages = history; draft = ""; chatBusy = true; chatError = ""
                                            scope.launch {
                                                val result = withContext(Dispatchers.IO) { sendNativeMessage(base, history, nativeProfileJson(profileName, profileNickname, profilePriorities, profileFood, profileRestrictions, assistantStyle), preferredProvider) }
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
    val match = Regex("""^\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Z°]+)\s+(?:to|in)\s+([a-zA-Z°]+)\s*$""")).find(query)
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

private fun nativeProfileJson(name: String, nickname: String, priorities: String, food: String, restrictions: String, style: String): JSONObject {
    return JSONObject().put("name", name).put("nickname", nickname).put("priorities", priorities)
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
        val file = java.io.File.createTempFile("aurora-voice-", ".audio", cacheDir)
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

private fun sendNativeMessage(baseUrl: String, history: List<Pair<String, String>>, profile: JSONObject, preferredProvider: String): Pair<Boolean, String> {
    return try {
        val messages = JSONArray()
        history.takeLast(20).forEach { (role, content) -> messages.put(JSONObject().put("role", role).put("content", content)) }
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
