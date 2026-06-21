function computeInstrumental(original: Float32Array[], vocals: Float32Array[]): Float32Array[] {
  const numChannels = original.length;
  const numFrames = original[0]?.length ?? 0;
  const result: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    const out = new Float32Array(numFrames);
    const orig = original[c];
    const voc = vocals[c] ?? new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      out[i] = orig[i] - voc[i];
    }
    result.push(out);
  }
  return result;
}

export { computeInstrumental };
