plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.aurora.assistant"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.aurora.assistant"
        minSdk = 26
        targetSdk = 35
        versionCode = providers.gradleProperty("auroraVersionCode").orNull?.toIntOrNull() ?: 1
        versionName = providers.gradleProperty("auroraVersionName").orNull ?: "0.1.0"
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("AURORA_KEYSTORE_PATH") ?: "release-key.jks")
            storePassword = System.getenv("AURORA_KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("AURORA_KEY_ALIAS") ?: ""
            keyPassword = System.getenv("AURORA_KEY_PASSWORD") ?: ""
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".nativepreview" }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
