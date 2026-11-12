# Relógio da Salvação: plano do projeto

Site de tela única que mostra, num despertador de cabeceira, quanto falta para a bolha da IA estourar. A meia-noite é o estouro. O ponteiro se move todo dia conforme notícias, balanços e geopolítica, lidos e pontuados por IA.

## 1. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Front-end | HTML, CSS e JavaScript puros (ES modules), sem framework e sem Bootstrap |
| Dados | Site estático lendo arquivos JSON gerados por um job agendado |
| Fontes | Feeds RSS e a base GDELT, com lista de fontes definida por nós |
| IA | A classificação das notícias roda no job, nunca no navegador (a chave de API fica em segredo) |
| O que o relógio mostra | Índice simbólico em minutos e segundos até a meia-noite, mais uma janela estimada de prazo |
| Visual | Despertador clássico de dois sinos, cena noturna |
| Planejamento visual | Mockup em HTML em `design/` (sem Figma por enquanto) |

## 2. Padrões de código adotados

Conforme a skill de manutenibilidade, na ordem de precedência (pedido do usuário, convenção do projeto, tabela de defaults):

- **Front-end:** MVC idiomático para JS puro: `models/` (dados e regras do relógio), `views/` (só desenham o DOM), `controllers/` (ligam model e view) e `services/` (acesso aos JSON).
- **Pipeline de coleta:** arquitetura em camadas: coletores, serviços (regra de negócio) e repositório (leitura e escrita dos JSON).
- **CSS:** BEM, com tokens de cor, tipo e espaçamento em variáveis CSS.
- **Configuração externalizada:** fontes, pesos, escala do relógio e modelo de IA ficam em `pipeline/config/`, não no meio do código. Segredos ficam em `.env`.
- **Clean code:** funções pequenas com um só propósito, nomes que dizem o que fazem, sem lógica solta no escopo global, testes nas regras de cálculo.

## 3. Metodologia do índice

### 3.1 Termômetros (metodologia v2, baseada em pesquisa)

O índice de risco (0 a 100) é a média ponderada de sete termômetros. Nota alta significa mais risco. Os pesos seguem a força da evidência na literatura sobre bolhas (Kindleberger, Minsky, Greenwood, Shleifer, Jordà, Schularick, Taylor, Borio, entre outros): o crédito é o preditor mais robusto e pesa mais. A pesquisa completa, os níveis de partida e as referências estão em `public/metodologia.html`.

| Termômetro | Peso | Nível de partida | Meia-vida | O que observa |
|---|---|---|---|---|
| Crédito e alavancagem | 25% | 65 | 45 dias | Dívida, crédito privado, acordos circulares, spreads e CDS |
| Investimento contra receita | 18% | 60 | 45 dias | Gasto em data centers e chips contra a receita real e o fluxo de caixa |
| Valuations e concentração | 17% | 70 | 30 dias | Múltiplos, alta acelerada de preços e concentração do índice |
| Euforia e emissão de ações | 12% | 60 | 14 dias | IPOs, lockups, ETFs alavancados, margem, volume |
| Demanda real e adoção | 12% | 40 | 45 dias | Receita e uso reais (invertido: boa demanda reduz a nota) |
| Gatilhos: juros, liquidez e regulação | 12% | 50 | 21 dias | Juros, liquidez, energia, controle de exportação, oposição política |
| Tecnologia e custos | 4% | 50 | 60 dias | Eficiência, custo por resposta, limites de energia e de chips |

Mudanças em relação à versão 1: crédito subiu de 20% para 25% (maior evidência empírica); entrou o termômetro de euforia e emissão de ações; tecnologia caiu de 10% para 4% (pouca evidência direta); cada termômetro passou a partir de um nível de referência de mercado, e não de 50; e o efeito das notícias passou a decair em ritmos diferentes. Tudo fica em `pipeline/config/dimensions.json`.

### 3.2 Papel da IA e papel do código

Para que o resultado seja auditável, a IA **não calcula o ponteiro**. Ela só classifica cada notícia:

1. Termômetro afetado.
2. Direção (aproxima ou afasta).
3. Magnitude de 1 a 5.
4. Confiança de 0 a 1.
5. Qualidade da evidência: dado verificável, reportagem ou opinião.
6. Justificativa em uma ou duas frases.

O código faz o resto: pondera pela qualidade da evidência (1, 0,75 e 0,4), aplica o decaimento de cada termômetro, soma ao nível de partida e aos pesos. Qualquer pessoa consegue refazer a conta a partir do JSON.

### 3.2.1 Queda de preços já em curso

Os termômetros medem a vulnerabilidade, não se a queda já começou. Por isso o índice tem um segundo componente, baseado em preços: a distância do Nasdaq Composite (FRED, série NASDAQCOM) à máxima dos últimos 12 meses. O sinal só começa a contar a partir de 10% (quedas menores são rotina) e leva o índice à meia-noite em 40%, o critério de colapso de Greenwood, Shleifer e You (2019). Entre os dois, o índice final é `vulnerabilidade + (100 − vulnerabilidade) × (queda − 10%) ÷ 30%`. É reversível: se o mercado se recupera, o efeito some.

Referência histórica (Nasdaq Composite, 1971 a 2026): depois da primeira queda de 10% a partir do pico de 12 meses, cerca de 46% chegaram a 20% e cerca de 10% a 40% em dois anos. Só 2 casos vieram depois de alta de 100% em dois anos, e ambos passaram de 20%. A amostra é pequena e não permite conclusão estatística. Limite conhecido: o sinal usa uma única série, que inclui empresas fora da IA; um teste de comportamento explosivo em preços (Phillips, Shi e Yu) seria o próximo passo.

### 3.3 Do índice ao relógio

- Minutos até a meia-noite: `15 × (1 − índice final ÷ 100)`, em que o índice final inclui o sinal de queda de preços.
- Variação de cada notícia: quantos segundos ela moveu o ponteiro no dia em que entrou.
- Janela de prazo (heurística, a validar) e faixa de chance de queda forte em 2 anos (referência aos estudos de Greenwood et al., não calibrada a este índice):

| Índice | Janela provável | Chance de queda forte em 2 anos |
|---|---|---|
| 85 ou mais | menos de 3 meses | 65% a 80% |
| 70 a 84 | 3 a 12 meses | 50% a 65% |
| 50 a 69 | 12 a 24 meses | 35% a 50% |
| 30 a 49 | 24 a 48 meses | 20% a 35% |
| abaixo de 30 | mais de 48 meses | 7% a 20% |

### 3.4 Limites que o site precisa assumir

- Não existe método que acerte a data de estouro de uma bolha. O relógio é um indicador simbólico e a janela é uma estimativa com nível de confiança visível.
- Por isso o site mostra a metodologia, as fontes de cada notícia e um aviso de que não é recomendação de investimento.
- "Resultado muito preciso" aqui significa transparente e reproduzível, não infalível. Os pesos são julgamento informado pela evidência, não coeficientes estimados. O próximo passo para dar mais credibilidade é um teste retrospectivo contra episódios passados (por exemplo, a bolha pontocom) e um sinal estatístico de preços (teste de Phillips, Shi e Yu).

## 4. Arquitetura

```
GitHub Actions (cron diário, 06:00)
        │
        ▼
 pipeline/ (Node)                         public/ (site estático)
  coletores ─► serviços ─► repositório ─► data/clock.json, data/entries.json
  RSS/GDELT    IA + cálculo                       │
                                                  ▼
                                      navegador lê os JSON e desenha o relógio
```

### Estrutura de pastas

```
relogio-da-salvacao/
├─ public/
│  ├─ index.html
│  ├─ css/            tokens.css, base.css, components/ (clock, readout, gauge, timeline)
│  ├─ js/
│  │  ├─ main.js
│  │  ├─ models/      clockModel.js, entryModel.js
│  │  ├─ views/       clockView.js, readoutView.js, gaugesView.js, timelineView.js
│  │  ├─ controllers/ clockController.js, timelineController.js
│  │  └─ services/    dataService.js
│  └─ data/           clock.json, entries.json (gerados pelo pipeline)
├─ pipeline/
│  ├─ config/         sources.json, dimensions.json, settings.js
│  ├─ collectors/     rssCollector.js, gdeltCollector.js
│  ├─ services/       classifierService.js, scoreService.js, dedupService.js
│  ├─ repositories/   entriesRepository.js
│  ├─ prompts/        classify.md
│  └─ index.js
├─ scripts/           servidor estático local
├─ tests/
├─ .github/workflows/daily-update.yml
├─ design/            mockup (já feito)
├─ .env.example
└─ README.md
```

### Formato dos dados

`clock.json`: índice, segundos até a meia-noite, janela de prazo, confiança, variação em 7 dias, nota de cada termômetro e data da atualização. O histórico diário do índice entra quando houver um gráfico de tendência.

`entries.json`: lista com data, fonte, título, link original, resumo, termômetro e segundos movidos (positivo aproxima, negativo afasta). A magnitude, a confiança e a justificativa da IA ficam no pipeline e entram no arquivo se a interface passar a mostrá-las.

O formato exato dos campos está no [README.md](README.md).

## 5. Telas e interação

Tela única, em rolagem, como no mockup (`design/mockup.html`):

1. **Relógio** no centro, com os ponteiros varrendo até a posição do dia na abertura da página e um tremor curto dos sinos. Respeita `prefers-reduced-motion`.
2. **Painel de leitura:** faltam X min Y s, janela provável de estouro e índice de risco.
3. **Termômetros:** as sete dimensões com nota, peso e variação na semana.
4. **Diário da bolha:** notícias em ordem cronológica, com data, fonte, resumo da IA, efeito em segundos e filtro (todas, aproximam, afastam).
5. **Método:** como o ponteiro é calculado, mais o aviso legal.

Padrões de qualidade: responsivo até celular, foco visível no teclado, contraste adequado, o efeito de cada notícia sempre com sinal e texto (nunca só cor).

## 6. Fases

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 0 | Aprovação do design e deste plano | Concluída: mockup aprovado |
| 1 | Front-end em MVC lendo JSON de exemplo | Concluída: página completa com dados fictícios e 21 testes dos models |
| 2 | Pipeline: coleta, classificação por IA, cálculo e escrita dos JSON | Código pronto e testado (105 testes, coleta real conferida), com classificação pelo Gemini. Falta a primeira rodada real com a credencial do Google, que gera o `clock.json` e o `entries.json` de verdade |
| 3 | Automação e publicação | Job diário atualiza o site sozinho |
| 4 | Calibração e revisão | Pesos revisados, acessibilidade auditada, README final |

## 7. O que preciso de você para as fases 2 e 3

- Acesso ao Gemini para a classificação. A organização do Google Cloud do projeto bloqueia chaves de API, então o caminho é o login do gcloud (ADC). Na máquina local ele funciona com `gcloud auth application-default login`. Para a automação diária (GitHub Actions) o login interativo não serve, e chaves de conta de serviço costumam estar bloqueadas pela mesma política. O caminho sem chaves é a Workload Identity Federation: o GitHub Actions prova quem é ao Google por um token temporário (OIDC) e o Google libera o acesso sem nenhum segredo guardado. Isso exige que quem administra o projeto crie o pool e o provedor de identidade e dê a permissão do Vertex AI à conta de serviço; eu preparo o fluxo de trabalho e a lista exata do que pedir.
- Onde publicar. Sugestão: GitHub Pages com GitHub Actions, que é gratuito e combina com o job diário. Alternativas: Netlify ou Vercel.
- Revisão da lista inicial de fontes (RSS) e dos pesos dos termômetros.
- Se quer domínio próprio.

## 8. Sobre o Figma

O conector do Figma está instalado mas ainda não foi autorizado. Se quiser um arquivo editável no Figma, autorize pelo `/mcp` num terminal do Claude Code e eu tento levar o design para lá.
