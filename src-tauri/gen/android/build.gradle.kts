buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        // 2.2: Media3 1.11 (app/build.gradle.kts) is built against the Kotlin 2.2 standard library.
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.20")
        // Embedded Python for Kodama's backend (python-backend/server.py), see app/build.gradle.kts.
        classpath("com.chaquo.python:gradle:17.1.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
        // NewPipeExtractor is published there only (see app/build.gradle.kts).
        maven("https://jitpack.io")
    }
}

tasks.register("clean").configure {
    delete("build")
}

