#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

// The desktop binary. The app lives in lib.rs, which the Android build loads as a library.
fn main() {
    kodama_lib::run()
}
