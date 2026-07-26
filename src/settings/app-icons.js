// Alternate app icons for personalization (live: taskbar/window/tray + macOS Dock & bundle).
// `file` matches the PNGs in public/App-Icons/ (also bundled as a Tauri resource for Rust).
export const APP_ICON_DEFAULT = "Kodama App Icon - Standard Pink.png";

export const APP_ICON_GROUPS = [
  { id: "default", labelKey: "appIconDefault", icons: [
    { label: "Standard Pink",  file: "Kodama App Icon - Standard Pink.png" },
    { label: "Standard White", file: "Kodama App Icon - Standard White.png" },
    { label: "3D Pink",        file: "Kodama App Icon - 3D Pink.png" },
  ]},
  { id: "pride", labelKey: "appIconPride", icons: [
    { label: "Pride",     file: "Kodama App Icon - Pride.png" },
    { label: "Progress",  file: "Kodama App Icon - Progress.png" },
    { label: "Trans",     file: "Kodama App Icon - Trans.png" },
    { label: "Nonbinary", file: "Kodama App Icon - Nonbinary.png" },
    { label: "Asexual",   file: "Kodama App Icon - Asexual.png" },
    { label: "Bisexual",  file: "Kodama App Icon - Bisexual.png" },
    { label: "Lesbian",   file: "Kodama App Icon - Lesbian.png" },
    { label: "Pansexual", file: "Kodama App Icon - Pansexual.png" },
    { label: "Polyamory", file: "Kodama App Icon - Polyamory.png" },
  ]},
];
