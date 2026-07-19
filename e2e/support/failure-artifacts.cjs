const fs = require("node:fs/promises");
const path = require("node:path");

const { requests } = require("../fixtures/client.cjs");
const { assertE2eNetworkPolicy } = require("./network-policy.cjs");

function artifactName(test) {
  const title =
    (typeof test.fullTitle === "function" ? test.fullTitle() : test.fullTitle) ||
    test.title ||
    "unknown-test";
  return `${new Date().toISOString().replaceAll(":", "-")}-${title.replaceAll(/[^a-z0-9]+/gi, "-").replaceAll(/^-|-$/g, "")}`;
}

async function writeArtifact(directory, filename, content) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), content);
}

async function saveFailureArtifacts(directory, test, error) {
  const testDirectory = path.join(directory, artifactName(test));
  await fs.mkdir(testDirectory, { recursive: true });
  await writeArtifact(testDirectory, "error.txt", `${error.stack || error}\n`);

  await Promise.allSettled([
    browser.saveScreenshot(path.join(testDirectory, "screenshot.png")),
    browser.getPageSource().then((html) => writeArtifact(testDirectory, "page.html", html)),
    browser
      .getLogs("browser")
      .then((logs) =>
        writeArtifact(testDirectory, "browser-console.json", JSON.stringify(logs, null, 2))
      ),
    requests().then((log) =>
      writeArtifact(testDirectory, "sidecar-requests.json", JSON.stringify(log, null, 2))
    ),
  ]);
}

function createAfterTestHook(directory, { assertNetwork = true } = {}) {
  return async function afterTest(test, context, result) {
    let failure = result?.error;
    try {
      if (assertNetwork) await assertE2eNetworkPolicy();
    } catch (error) {
      failure ||= error;
      throw error;
    } finally {
      if (failure) await saveFailureArtifacts(directory, test, failure);
    }
  };
}

module.exports = { createAfterTestHook };
