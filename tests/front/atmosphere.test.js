import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ATMOSPHERE } from "../../public/js/config.js";

describe("atmosfera do topo", () => {
  it("mantém poucas bolhas subindo, mesmo com risco máximo", () => {
    const most = ATMOSPHERE.bubbleBase + Math.round(100 / ATMOSPHERE.bubblePerIndexPoints);
    assert.ok(most <= 10, "o pedido foi de poucas bolhas");
  });

  it("troca para o tema claro só a partir do limite configurado", () => {
    assert.ok(ATMOSPHERE.lightFromIndex > 50 && ATMOSPHERE.lightFromIndex < 70);
  });
});
