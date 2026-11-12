import { ATMOSPHERE } from "../config.js";
import { createElement } from "../utils/dom.js";

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createRisingBubble(speedFactor) {
  const size = randomBetween(ATMOSPHERE.bubbleMinSize, ATMOSPHERE.bubbleMaxSize);
  const bubble = createElement("span", { className: "rising" });

  bubble.style.cssText = [
    `left:${randomBetween(4, 96)}%`,
    `width:${size}px`,
    `height:${size}px`,
    `--dur:${randomBetween(14, 26) * speedFactor}s`,
    `--delay:${-randomBetween(0, 24)}s`,
    `--sway:${randomBetween(3, 6)}s`,
    `--stop:${randomBetween(5, 90)}%`,
  ].join(";");

  return bubble;
}

export function countRisingBubbles(index) {
  return ATMOSPHERE.bubbleBase + Math.round(index / ATMOSPHERE.bubblePerIndexPoints);
}

export function renderAtmosphere(hero, bubbleLayer, index) {
  hero.style.setProperty("--r", String(index));
  hero.classList.toggle("is-light", index >= ATMOSPHERE.lightFromIndex);

  const speedFactor = 1.3 - index * 0.006;
  const bubbles = Array.from({ length: countRisingBubbles(index) }, () => createRisingBubble(speedFactor));
  bubbleLayer.replaceChildren(...bubbles);
}
