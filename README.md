# Relógio da Salvação

Site de tela única que mostra, num despertador de cabeceira, quanto falta para a bolha da IA estourar. A meia-noite é o estouro. O plano completo está em [PLANO.md](PLANO.md).

**Estado atual:** fases 1 e 2 prontas, com metodologia v2 baseada em pesquisa. O site (`public/`) mostra dados reais de 8 de outubro a 5 de novembro de 2026, classificados manualmente por IA numa conversa (veja Modo manual). O pipeline automático com o Gemini está pronto, mas ainda não rodou: falta a credencial do Google. A automação diária é a fase 3. A pesquisa que define termômetros, pesos e limites está em `public/metodologia.html` (no site, em Pesquisa).

## Requisitos

- Node.js 22.9 ou superior.
- Acesso ao Gemini, do Google, só para rodar o pipeline completo: uma chave do Google AI Studio ou o login do gcloud (veja Configuração). O site e os testes não precisam disso.

## Instalação

```bash
npm install
```

## Uso

Site local (http://localhost:5174):

```bash
npm run dev
```

Pipeline em modo simulação: coleta e filtra as notícias reais, mas não chama a IA nem grava nada. Serve para conferir as fontes.

```bash
npm run pipeline:dry
```

Pipeline completo: classifica as notícias novas com a IA e atualiza `public/data/clock.json`, `public/data/entries.json` e `pipeline/state/ledger.json`.

```bash
npm run pipeline
```

### Modo manual (sem chamar nenhuma API)

Enquanto a automação com o Gemini não está ligada, a classificação pode ser feita por uma pessoa ou por uma IA numa conversa, e o código faz o resto:

1. `npm run pipeline:export` coleta as notícias novas e grava as candidatas em `pipeline/state/candidates.json` (id, fonte, data, título e trecho).
2. Quem classifica lê o arquivo e grava `pipeline/state/classifications.json`: uma lista com um item por candidata, no mesmo formato que o Gemini devolveria (`id`, `relevant`, `gaugeId`, `direction`, `magnitude` de 1 a 5, `confidence` de 0 a 1, `evidence` (`dado`, `reportagem` ou `opiniao`), `titlePt`, `summaryPt` e `rationale`; para as irrelevantes basta `{ "id": "...", "relevant": false }`).
3. `npm run pipeline:apply` valida cada classificação com as mesmas regras do fluxo automático, pontua e grava `public/data/clock.json` e `public/data/entries.json`. O `clock.json` sai com um aviso, mostrado no topo do site, dizendo que a classificação foi manual.

Depois de mudar a metodologia (termômetros, pesos ou campos), reavalie o histórico inteiro com `npm run pipeline:reclassify`, que exporta as notícias relevantes já guardadas junto com as novas, e aplique com `npm run pipeline:apply -- --reclassify`. Enquanto houver notícias de uma versão antiga do modelo, o pipeline se recusa a publicar e não altera nada. As candidatas que não estão no arquivo de classificações continuam pendentes e voltam na próxima exportação. Para passar ao modo automático, basta rodar `npm run pipeline` com a credencial do Google: o resto do fluxo é o mesmo, e o aviso some.

Testes (nenhum chama a internet ou a API):

```bash
npm test
```

## Configuração

1. Copie `.env.example` para `.env`. O `.env` está no `.gitignore`.
2. Escolha **uma** forma de autenticar no Gemini:
   - **Chave do AI Studio:** crie em https://aistudio.google.com/apikey e preencha `GEMINI_API_KEY`.
   - **Login do gcloud (Vertex AI):** instale o gcloud, rode `gcloud auth application-default login` num terminal e preencha `GOOGLE_CLOUD_PROJECT` (e, se quiser, `GOOGLE_CLOUD_LOCATION`, que por padrão é `global`). Se as duas formas estiverem preenchidas, vale a chave.
3. Opcional: `CLASSIFIER_MODEL` troca o modelo da classificação. O padrão é `gemini-3.5-flash-lite`, o mais barato; `gemini-3.8-flash` é mais capaz e custa mais.

Ajustes sem mexer em código:

| O que | Onde |
|---|---|
| Fontes RSS, consultas do GDELT e palavras que tornam uma notícia candidata | `pipeline/config/sources.json` |
| Termômetros: peso, nível de partida, meia-vida e a justificativa de cada um | `pipeline/config/dimensions.json` |
| Escala do relógio, pesos da qualidade da evidência, faixas de prazo e de chance de queda, sinal de queda de preços (série, janela, limiares e fases), tamanho de lote, retenção | `pipeline/config/settings.js` |
| Instruções dadas à IA | `pipeline/prompts/classify.md` |
| Caminhos, limiares de risco e fuso do site | `public/js/config.js` |
| Cores, fontes e espaçamentos | `public/css/tokens.css` |

## Como o pipeline funciona

1. **Coleta.** Lê os feeds RSS e as consultas do GDELT. Se uma fonte falhar, as outras seguem; se todas falharem, nada é alterado.
2. **Filtro.** Descarta o que está fora do período (30 dias), o que não menciona temas de IA e o que já foi visto (por link ou por título parecido).
3. **Classificação.** O Gemini recebe lotes de 8 notícias e devolve, para cada uma: se é relevante, o termômetro afetado, a direção (aproxima ou afasta), a magnitude de 1 a 5, a confiança de 0 a 1, a qualidade da evidência (dado, reportagem ou opinião), o título e o resumo em português e a justificativa. O código valida cada resposta. O que vier inválido não entra no ledger e é tentado de novo na rodada seguinte.
4. **Pontuação.** Cada notícia soma ou subtrai pontos no termômetro dela: `magnitude × confiança × peso da evidência` (dado 1, reportagem 0,75, opinião 0,4), com o efeito caindo pela metade a cada meia-vida do termômetro (14 dias para euforia, 60 para tecnologia). A nota de cada termômetro parte de um nível de referência baseado em dados de mercado, e o índice é a média ponderada dos sete termômetros. O ponteiro vem do índice sem arredondar: `900 × (1 − índice ÷ 100)` segundos. Os segundos que cada notícia "moveu" são `9 × peso do termômetro × pontos`, com uma casa decimal.
5. **Queda de preços.** Baixa a série diária do Nasdaq Composite (FRED, sem chave) e mede a queda em relação à máxima de 12 meses. O sinal só começa a contar a partir de 10% e leva o índice à meia-noite em 40%, o critério de colapso de Greenwood, Shleifer e You (2019): `índice final = vulnerabilidade + (100 − vulnerabilidade) × (queda − 10%) ÷ 30%`. Se a série não puder ser baixada, o pipeline avisa e publica sem o sinal.
6. **Publicação.** Grava os JSON de forma atômica, só depois de tudo ter dado certo.

A IA nunca calcula o ponteiro. Ela só classifica, e o resto é conta que dá para refazer a partir de `pipeline/state/ledger.json`.

A confiança da estimativa (`baixa` ou `média`) mede só a quantidade de notícias recentes. Ela não mede a chance de acerto e nunca chega a `alta`.

A faixa de "chance de queda forte em 2 anos" vem de uma tabela por faixa de índice, ancorada em números dos estudos de Greenwood et al. (2019, 2022). Ela não foi calibrada aos dados deste índice. Os pesos são julgamento informado pela força da evidência, não coeficientes estimados, e os níveis de partida são uma leitura de dados publicados. Tudo isso, com as referências e os limites, está na página de pesquisa.

### Custo

A classificação é o único gasto. Cada rodada imprime os tokens usados. Preços da tabela do Google (por 1 milhão de tokens, saída inclui o raciocínio do modelo): `gemini-3.5-flash-lite` US$ 0,30 de entrada e US$ 2,50 de saída; `gemini-3.8-flash` US$ 0,75 e US$ 3,75 até 31/12/2026, e US$ 1,50 e US$ 7,50 depois.

Estimativa antes da primeira rodada real: a rodada inicial (cerca de 120 notícias) fica em torno de US$ 0,10 com o `flash-lite`, e as rodadas diárias (30 a 40 notícias novas) em torno de US$ 0,03. A primeira rodada real dá o número exato.

A página de preços do Google lista os dois modelos como gratuitos na chave do AI Studio, mas não informa os limites de uso, e o plano gratuito pode usar o conteúdo enviado para melhorar produtos do Google. As notícias são públicas, então isso pesa pouco. Pelo Vertex AI (login do gcloud) a cobrança vai para o projeto do Google Cloud.

## Estrutura

```
public/                    site estático
  index.html
  metodologia.html         pesquisa, pesos e referências
  css/                     tokens.css, base.css e components/ (um arquivo por componente, nomes em BEM)
  js/
    main.js                monta a página e liga as camadas
    config.js              constantes (caminhos, limiares, meses)
    models/                regras e validação dos dados (clockModel, entryModel, effectModel)
    views/                 desenham o DOM a partir dos models
    controllers/           ligam models, views e eventos de cada seção
    services/              acesso aos arquivos JSON (dataService)
    utils/                 formatadores e criação de elementos
  data/                    clock.json e entries.json
pipeline/                  coleta e classificação (Node)
  index.js                 entrada de linha de comando
  run.js                   orquestra uma rodada
  config/                  fontes, termômetros, ajustes e carregamento
  collectors/              rssCollector, gdeltCollector, priceCollector (série do Nasdaq no FRED)
  providers/               acesso ao Gemini (geminiClient: autenticação; geminiProvider: pedido e resposta)
  services/                coleta, filtro, classificador, pontuação, ledger e publicação
  repositories/            leitura e escrita dos arquivos (dataRepository)
  prompts/                 instruções da IA
  utils/                   http, texto e datas
  state/ledger.json        histórico das notícias já classificadas (criado na primeira rodada)
design/                    mockup da interface
scripts/                   servidor estático local
tests/                     front/ e pipeline/
```

Padrão adotado: MVC idiomático para JavaScript puro no site, e camadas (coletores, serviços, repositório) no pipeline. Os models e serviços guardam as regras e são testáveis sem rede.

## Formato dos dados

`public/data/clock.json`:

| Campo | Descrição |
|---|---|
| `meta.isSample` | `true` mostra o aviso de dados de exemplo |
| `index` | índice de risco final, de 0 a 100, já com o sinal de queda de preços |
| `baseIndex` | índice só da vulnerabilidade (termômetros), antes do sinal de queda |
| `priceSignal` | sinal de queda de preços: série, máxima, queda em %, fase, progresso até 40%, índices antes e depois e as taxas históricas (`baseRates`). Ausente se a série não estiver disponível |
| `secondsToMidnight` | segundos até a meia-noite |
| `deadline` | janela de prazo em meses (`fromMonths` e `toMonths`, um deles pode ser `null`) |
| `crashProbability` | faixa de chance de queda forte em 2 anos, em % (`fromPercent` e `toPercent`), como referência histórica |
| `meta.methodVersion` | versão da metodologia (2 = termômetros, evidência e níveis de partida da pesquisa) |
| `meta.notice` | texto de aviso mostrado no topo do site, por exemplo sobre a classificação manual |
| `confidence` | `baixa` ou `média`, conforme a cobertura recente |
| `deltaSeconds7d` | variação do ponteiro em 7 dias, em segundos (positivo aproxima) |
| `updatedAt` | data e hora da atualização, em ISO 8601 |
| `gauges` | termômetros: `id`, `name`, `weight` (fração), `score` e `weeklyDelta` |

`public/data/entries.json`: lista de notícias com `id`, `date` (AAAA-MM-DD), `source`, `title`, `summary`, `url`, `gaugeId`, `evidence` (`dado`, `reportagem` ou `opiniao`) e `deltaSeconds` (positivo aproxima, negativo afasta, com uma casa decimal).

## Solução de problemas

- **O site mostra "Não foi possível carregar os dados":** confira se abriu pelo servidor (`npm run dev`) e se os JSON de `public/data/` existem e são válidos. O erro detalhado aparece no console do navegador.
- **O relógio não anima:** o sistema pode estar com "reduzir movimento" ligado. O site respeita isso e mostra os ponteiros já na posição final.
- **O pipeline diz "Credencial do Gemini não encontrada":** nem `GEMINI_API_KEY` nem `GOOGLE_CLOUD_PROJECT` estão preenchidos. Confira se o arquivo se chama exatamente `.env` e está na raiz do projeto. O pipeline avisa isso antes de coletar qualquer coisa.
- **O Google diz "Chaves de API não são permitidas":** a política da organização do projeto bloqueia chaves. Não há como contornar isso do nosso lado; use o login do gcloud (`GOOGLE_CLOUD_PROJECT`) ou peça a quem administra a organização para liberar chaves nesse projeto.
- **O pipeline diz "Credencial recusada pelo Google":** a chave está errada, ou o login do gcloud expirou (rode `gcloud auth application-default login` de novo) ou a conta não tem permissão no projeto.
- **O pipeline diz "A classificação falhou em todos os lotes":** a API ficou indisponível, estourou a cota ou recusou os pedidos. O pipeline já tenta de novo 3 vezes com espera em erros temporários (cota e instabilidade). Nada foi gravado, então é seguro rodar de novo.
- **Nome de modelo não encontrado:** os nomes mudam com frequência. Confira a lista em https://ai.google.dev/gemini-api/docs/models e ajuste `CLASSIFIER_MODEL`.
- **O pipeline avisa "Série de preços indisponível":** o FRED não respondeu ou a série veio curta. A rodada continua, mas o índice sai sem o sinal de queda; rode de novo mais tarde.
- **Uma fonte aparece como "falhou":** feeds saem do ar de vez em quando e as outras fontes seguem. O GDELT em especial limita a taxa de requisições (erro 429) e às vezes demora a responder. O coletor espera 6 segundos entre consultas e desiste do GDELT na primeira vez que ele recusar.
- **Acentos quebrados em alguma fonte:** o coletor lê o charset do cabeçalho HTTP ou da declaração do XML. Se uma fonte declarar errado, o texto sai trocado.
