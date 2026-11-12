export function describeEffect(deltaSeconds) {
  if (deltaSeconds > 0) return { direction: "closer", seconds: deltaSeconds };
  if (deltaSeconds < 0) return { direction: "farther", seconds: Math.abs(deltaSeconds) };
  return { direction: "neutral", seconds: 0 };
}
