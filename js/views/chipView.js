import { createElement } from "../utils/dom.js";
import { formatSeconds } from "../utils/formatters.js";

const CHIP_LABELS = {
  closer: (seconds) => `▲ ${formatSeconds(seconds)} s mais perto`,
  farther: (seconds) => `▼ ${formatSeconds(seconds)} s mais longe`,
};

export function createEffectChip(effect, neutralLabel) {
  const text =
    effect.direction === "neutral" ? `= ${neutralLabel}` : CHIP_LABELS[effect.direction](effect.seconds);

  return createElement("span", { className: `chip chip--${effect.direction}`, text });
}
