const FIXTURE_ORIGIN = "http://127.0.0.1:9847";
const allowedOrigins = new Set([window.location.origin, FIXTURE_ORIGIN, "http://localhost:9847"]);
const redirectedRequests = [];
const policyViolations = [];

function toUrl(input) {
  if (input instanceof Request) return input.url;
  return new URL(String(input), window.location.href).href;
}

function fixtureUrlForExternalRequest(url) {
  return `${FIXTURE_ORIGIN}/__e2e__/external?url=${encodeURIComponent(url)}`;
}

function guardUrl(input) {
  const url = toUrl(input);
  const origin = new URL(url).origin;
  if (allowedOrigins.has(origin)) return input;

  redirectedRequests.push(url);
  return fixtureUrlForExternalRequest(url);
}

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => originalFetch(guardUrl(input), init);

const OriginalEventSource = window.EventSource;
window.EventSource = class GuardedEventSource extends OriginalEventSource {
  constructor(url, options) {
    super(guardUrl(url), options);
  }
};

window.addEventListener("securitypolicyviolation", (event) => {
  policyViolations.push({
    blockedURI: event.blockedURI,
    violatedDirective: event.violatedDirective,
  });
});

// Redirected fetch/EventSource calls are retained for assertions. CSP violations
// are the hard failure: they show that a request attempted to leave the test
// origins without going through this guard.
window.__kodamaE2eRedirectedNetworkRequests = redirectedRequests;
window.__kodamaE2eNetworkPolicyViolations = policyViolations;
