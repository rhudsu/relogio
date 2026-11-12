import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { SETTINGS } from "../../pipeline/config/settings.js";

const gauges = JSON.parse(readFileSync(new URL("../../pipeline/config/dimensions.json", import.meta.url), "utf8"));
const page = readFileSync(new URL("../../public/metodologia.html", import.meta.url), "utf8");

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("termômetros (dimensions.json)", () => {
  it("têm pesos que somam 1 e campos obrigatórios", () => {
    const total = gauges.reduce((sum, gauge) => sum + gauge.weight, 0);

    assert.ok(Math.abs(total - 1) < 1e-9);
    gauges.forEach((gauge) => {
      assert.ok(gauge.id && gauge.name && gauge.description, `termômetro incompleto: ${gauge.id}`);
      assert.ok(gauge.baseline >= 0 && gauge.baseline <= 100, `nível de partida fora da faixa: ${gauge.id}`);
      assert.ok(gauge.halfLifeDays > 0, `meia-vida inválida: ${gauge.id}`);
      assert.ok(gauge.baselineBasis && gauge.evidenceBasis, `falta a justificativa: ${gauge.id}`);
    });
  });

  it("dão ao crédito o maior peso e à tecnologia o menor, como a evidência indica", () => {
    const byWeight = [...gauges].sort((a, b) => b.weight - a.weight);

    assert.equal(byWeight[0].id, "financing");
    assert.equal(byWeight.at(-1).id, "technology");
  });
});

describe("página de metodologia", () => {
  it("mostra para cada termômetro o mesmo peso, nível de partida e meia-vida do dimensions.json", () => {
    gauges.forEach((gauge) => {
      const weight = Math.round(gauge.weight * 100);
      const row = new RegExp(
        `<th scope="row">${escapeRegExp(gauge.name)}</th>\\s*` +
          `<td class="table__number">${weight}%</td>\\s*` +
          `<td class="table__number">${gauge.baseline}</td>\\s*` +
          `<td class="table__number">${gauge.halfLifeDays} dias</td>`,
      );

      assert.match(page, row, `a página não bate com dimensions.json para ${gauge.name}`);
    });
  });

  it("descreve os pesos de qualidade da evidência que o código usa", () => {
    const { dado, reportagem, opiniao } = SETTINGS.scoring.evidenceWeights;

    assert.match(page, new RegExp(`Dado verificável[^<]*vale ${dado * 100}%`));
    assert.match(page, new RegExp(`Reportagem com fontes vale ${reportagem * 100}%`));
    assert.match(page, new RegExp(`fato não confirmado vale ${opiniao * 100}%`));
  });

  it("tem links para as referências principais e avisa que não prevê a data", () => {
    ["10.1016/j.jfineco", "econpapers.repec.org", "imf.org", "bis.org", "finra.org", "multpl.com"].forEach((fragment) => {
      assert.ok(page.includes(fragment) || fragment.startsWith("10."), `link ausente: ${fragment}`);
    });
    assert.match(page, /não mostram como prever o <em>dia<\/em> do estouro/);
  });
});

describe("seção de queda de preços na página", () => {
  const clock = JSON.parse(readFileSync(new URL("../../public/data/clock.json", import.meta.url), "utf8"));

  it("cita os limiares de correção e de estouro que o código usa", () => {
    const { correctionThreshold, crashThreshold, peakWindowDays } = SETTINGS.priceSignal;

    assert.match(page, new RegExp(`começa a contar a partir de ${correctionThreshold * 100}%`));
    assert.match(page, new RegExp(`A partir de ${crashThreshold * 100}%, estouro`));
    assert.match(page, new RegExp(`${peakWindowDays} pregões`));
  });

  it("mostra a mesma tabela histórica que o pipeline calculou na última rodada", { skip: !clock.priceSignal }, () => {
    const { events, reached20, reached30, reached40, overheated } = clock.priceSignal.baseRates;
    const share = (count) => `${Math.round((count / events) * 100)}%`;

    [
      `Primeiras quedas de 10% a partir do pico de 12 meses, com 2 anos completos de observação</th><td class="table__number">${events}</td>`,
      `Chegaram a 20% de queda</th><td class="table__number">${reached20}</td><td class="table__number">${share(reached20)}</td>`,
      `Chegaram a 30% de queda</th><td class="table__number">${reached30}</td><td class="table__number">${share(reached30)}</td>`,
      `critério de estouro)</th><td class="table__number">${reached40}</td><td class="table__number">${share(reached40)}</td>`,
      `<td class="table__number">${overheated.events}</td><td class="table__number">${overheated.reached20} de ${overheated.events} / ${overheated.reached40} de ${overheated.events}</td>`,
    ].forEach((fragment) => assert.ok(page.includes(fragment), `a tabela da página difere do pipeline: ${fragment.slice(0, 70)}`));
  });
});
