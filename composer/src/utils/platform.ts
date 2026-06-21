const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

const MOD_KEY = isMac ? "Cmd" : "Ctrl";
const ALT_KEY = isMac ? "Option" : "Alt";

export { isMac, MOD_KEY, ALT_KEY };
