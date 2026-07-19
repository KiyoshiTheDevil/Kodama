async function assertE2eNetworkPolicy() {
  const violations = await browser.execute(() => window.__kodamaE2eNetworkPolicyViolations || []);
  if (violations.length === 0) return;

  const details = violations
    .map(({ blockedURI, violatedDirective }) => `${violatedDirective}: ${blockedURI}`)
    .join("\n");
  throw new Error(
    `The application attempted outbound network access outside the E2E fixture server.\n${details}`
  );
}

module.exports = { assertE2eNetworkPolicy };
