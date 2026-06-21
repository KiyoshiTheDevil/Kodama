#[cfg(windows)]
fn tag_webview2_audio_sessions() {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::{
        core::*, Win32::Foundation::*, Win32::Media::Audio::*, Win32::System::Com::*,
        Win32::System::Threading::*,
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let Ok(enumerator) =
            CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
        else {
            return;
        };

        let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) else {
            return;
        };

        let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else {
            return;
        };

        let Ok(session_enum) = manager.GetSessionEnumerator() else {
            return;
        };

        let Ok(count) = session_enum.GetCount() else {
            return;
        };

        for i in 0..count {
            let Ok(ctrl) = session_enum.GetSession(i) else {
                continue;
            };
            let Ok(ctrl2) = ctrl.cast::<IAudioSessionControl2>() else {
                continue;
            };
            let Ok(pid) = ctrl2.GetProcessId() else {
                continue;
            };
            if pid == 0 {
                continue;
            }

            let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
                continue;
            };

            let mut buf = [0u16; 260];
            let mut len = 260u32;
            let is_webview = QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .is_ok()
                && {
                    let path = OsString::from_wide(&buf[..len as usize]);
                    path.to_string_lossy()
                        .to_lowercase()
                        .contains("msedgewebview2")
                };

            let _ = CloseHandle(handle);

            if is_webview {
                let _ = ctrl.SetDisplayName(w!("Kodama"), std::ptr::null());
            }
        }
    }
}

#[cfg(windows)]
pub fn start_audio_session_tagger() {
    std::thread::spawn(|| loop {
        tag_webview2_audio_sessions();
        std::thread::sleep(std::time::Duration::from_secs(3));
    });
}
