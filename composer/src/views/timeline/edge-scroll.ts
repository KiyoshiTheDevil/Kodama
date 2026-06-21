// -- Types ---------------------------------------------------------------------

interface EdgeScrollInput {
  pointerX: number;
  contentLeft: number;
  contentRight: number;
  edgeSize: number;
  maxSpeed: number;
}

// -- Functions -----------------------------------------------------------------

function computeEdgeScrollVelocity({
  pointerX,
  contentLeft,
  contentRight,
  edgeSize,
  maxSpeed,
}: EdgeScrollInput): number {
  if (pointerX < contentLeft + edgeSize) {
    const depth = Math.min(edgeSize, contentLeft + edgeSize - pointerX);
    return -maxSpeed * (depth / edgeSize);
  }
  if (pointerX > contentRight - edgeSize) {
    const depth = Math.min(edgeSize, pointerX - (contentRight - edgeSize));
    return maxSpeed * (depth / edgeSize);
  }
  return 0;
}

// -- Exports -------------------------------------------------------------------

export { computeEdgeScrollVelocity };
