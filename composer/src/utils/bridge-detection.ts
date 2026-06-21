const KEY = "composer:bridge-ever-detected";

const hasBridgeEverBeenDetected = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

const markBridgeDetected = (): void => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore quota / privacy mode */
  }
};

export { hasBridgeEverBeenDetected, markBridgeDetected };
