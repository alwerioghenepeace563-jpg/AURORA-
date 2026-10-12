package com.aurora.assistant

import android.os.Bundle
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
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
    var page by remember { mutableStateOf("AURORA") }
    var latestVersion by remember { mutableStateOf<String?>(null) }
    var releaseNotes by remember { mutableStateOf("") }
    var releaseUrl by remember { mutableStateOf("") }
    var updateMessage by remember { mutableStateOf("Check GitHub Releases for the latest AURORA build.") }
    var checking by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

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
                Column(Modifier.weight(1f)) {
                    Text("A U R O R A", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, letterSpacing = 3.sp)
                    Text("PERSONAL AI ASSISTANT", color = Muted, fontSize = 9.sp, letterSpacing = 2.sp)
                }
                Text("NATIVE ANDROID", color = Cyan, fontSize = 9.sp,
                    modifier = Modifier.border(1.dp, Cyan.copy(alpha = .45f), RoundedCornerShape(20.dp)).padding(horizontal = 10.dp, vertical = 7.dp))
            }

            Spacer(Modifier.height(24.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                NativeTab("Assistant", page == "AURORA") { page = "AURORA" }
                NativeTab("Activities", page == "Activities") { page = "Activities" }
                NativeTab("Settings", page == "Settings") { page = "Settings" }
                NativeTab("Updates", page == "Updates") { page = "Updates" }
            }
            Spacer(Modifier.height(18.dp))

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
                                Button(
                                    onClick = {
                                        checking = true
                                        updateMessage = "Checking the official AURORA releases…"
                                        scope.launch {
                                            val result = withContext(Dispatchers.IO) { checkLatestRelease() }
                                            latestVersion = result?.optString("tag_name")?.takeIf { it.isNotBlank() }
                                            releaseNotes = result?.optString("body")?.take(1400).orEmpty()
                                            releaseUrl = result?.optString("html_url").orEmpty()
                                            updateMessage = if (result == null) {
                                                "Couldn't reach the releases service. Check your connection and try again."
                                            } else if ((result.optJSONArray("assets")?.length() ?: 0) > 0) {
                                                "Release found. Open the release page to review its APK and installation notes."
                                            } else {
                                                "Release found, but no downloadable APK asset is attached yet."
                                            }
                                            checking = false
                                        }
                                    },
                                    enabled = !checking,
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = Cyan, contentColor = Night)
                                ) { Text(if (checking) "Checking…" else "Check for updates", fontWeight = FontWeight.Bold) }
                                if (releaseUrl.isNotBlank()) {
                                    Spacer(Modifier.height(10.dp))
                                    OutlinedButton(
                                        onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(releaseUrl))) }.onFailure { updateMessage = "Could not open the release page on this device." } },
                                        modifier = Modifier.fillMaxWidth()
                                    ) { Text("Release page available") }
                                }
                                Spacer(Modifier.height(10.dp))
                                Text(updateMessage, color = Muted, fontSize = 12.sp)
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        Text("Updates are checked against the official GitHub Releases feed. Installation will require your approval.", color = Muted, fontSize = 12.sp)
                    }
                }
                "Activities" -> SimplePage("Activities", "Your AURORA activity history will appear here.")
                "Settings" -> SimplePage("Settings", "Native settings and assistant permissions.")
                else -> {
                    Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            NativeOrb()
                            Spacer(Modifier.height(30.dp))
                            Text("AURORA", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Light, letterSpacing = 8.sp)
                            Spacer(Modifier.height(8.dp))
                            Text("YOUR PERSONAL AI ASSISTANT", color = Muted, fontSize = 10.sp, letterSpacing = 2.sp)
                            Spacer(Modifier.height(34.dp))
                            Text("Native Android foundation", color = Cyan, fontSize = 14.sp)
                            Spacer(Modifier.height(8.dp))
                            Text("This screen is rendered by Android Compose, not a website.", color = Muted, fontSize = 12.sp)
                            Spacer(Modifier.height(22.dp))
                            OutlinedButton(onClick = { page = "Updates" }) { Text("Manage app updates", color = Cyan) }
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Text("AURORA • ANDROID", color = Muted.copy(alpha = .7f), fontSize = 10.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        }
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
private fun NativeOrb() {
    val transition = rememberInfiniteTransition(label = "aurora-orb")
    val pulse by transition.animateFloat(
        initialValue = 0.92f, targetValue = 1.08f,
        animationSpec = infiniteRepeatable(tween(1900), RepeatMode.Reverse),
        label = "pulse"
    )
    Canvas(Modifier.size(238.dp)) {
        val c = Offset(size.width / 2f, size.height / 2f)
        val radius = size.minDimension * .27f * pulse
        drawCircle(Brush.radialGradient(listOf(Cyan.copy(alpha = .23f), Color(0xFF3678FF).copy(alpha = .10f), Color.Transparent), c, size.minDimension * .49f), size.minDimension * .49f, c)
        drawCircle(Brush.radialGradient(listOf(Color(0xFFBDF9FF), Cyan, Color(0xFF1455A8), Color(0xFF07152B)), c, radius * 1.5f), radius * 1.5f, c)
        drawCircle(Cyan.copy(alpha = .55f), radius * 1.68f, c, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.2.dp.toPx()))
        drawCircle(Color.White.copy(alpha = .75f), radius * .32f, Offset(c.x - radius * .35f, c.y - radius * .4f))
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

private fun checkLatestRelease(): JSONObject? {
    return try {
        val connection = (URL("https://api.github.com/repos/alwerioghenepeace563-jpg/AURORA-/releases/latest").openConnection() as HttpURLConnection)
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
