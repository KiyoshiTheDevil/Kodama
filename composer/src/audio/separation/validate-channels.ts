function hasOnlyFiniteSamples(channels: Float32Array[]): boolean {
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      if (!Number.isFinite(channel[i])) return false;
    }
  }
  return true;
}

export { hasOnlyFiniteSamples };
