const CONTROL_URL = "http://127.0.0.1:9847/__e2e__/";

async function control(path, body) {
  const response = await fetch(`${CONTROL_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) throw new Error(`Fixture control failed (${response.status}): ${path}`);
  return response.json();
}

function reset(preset = "firstRun") {
  return control("reset", { preset });
}

function route(method, pathname, response) {
  return control("route", { method, pathname, response });
}

async function requests() {
  const response = await fetch(`${CONTROL_URL}requests`, { method: "POST" });
  if (!response.ok) throw new Error(`Fixture request log failed (${response.status})`);
  return (await response.json()).requests;
}

function clearRequests() {
  return control("clear-requests");
}

module.exports = { clearRequests, requests, reset, route };
