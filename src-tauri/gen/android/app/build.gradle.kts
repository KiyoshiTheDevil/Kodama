import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
    id("com.chaquo.python")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "dev.kodama.music"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "dev.kodama.music"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                // 64-bit only, see buildSrc/.../RustPlugin.kt.
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    // NewPipeExtractor uses java.time and other APIs newer than minSdk 24 has.
    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_1_8)
    }
}

rust {
    rootDirRel = "../../../"
}

// Kodama's backend, run inside the app: the same server.py as on the desktop, started by
// android_main.py from MainActivity. Only those two files are taken from python-backend, which
// also holds caches, build output and the desktop's ffmpeg.
//
// Packages: what the server needs to load and to browse. Left out for now: the desktop's PO-token
// path (yt-dlp-ejs, bgutil), which needs Node, and numpy/scipy/Pillow, which only the video sync
// and the download tagging import, and only when they run.
chaquopy {
    defaultConfig {
        version = "3.13"
        // Unpacked to real files on first start: pykakasi opens its dictionaries by path, which
        // fails on files left inside the APK.
        extractPackages("pykakasi")
        pip {
            install("flask")
            install("flask-cors")
            install("requests")
            install("ytmusicapi==1.12.2")
            install("yt-dlp")
            install("mutagen")
            install("pykakasi")
        }
    }
    sourceSets {
        getByName("main") {
            srcDir("../../../../python-backend")
            include("server.py", "android_main.py")
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    // Stream addresses on the phone (StreamExtractor.kt): deciphering inside the JVM, where the
    // desktop needs Node for it.
    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.26.5")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Notification, lock screen and headset buttons for the page's player (MediaBridge.kt).
    implementation("androidx.media3:media3-session:1.11.1")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.5")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")