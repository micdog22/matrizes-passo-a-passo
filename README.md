# Matrizes Passo a Passo

Calculadora de álgebra linear que mostra o caminho, não só a resposta: determinante, inversa, posto, sistemas lineares, decomposição PLU e autovalores, sempre com frações exatas e cada operação elementar escrita como no caderno (`L2 <- L2 - 3*L1`). Feita para quem está estudando Geometria Analítica, Álgebra Linear ou Cálculo Numérico e quer conferir as contas.

**Acesse online:** https://micdog22.github.io/matrizes-passo-a-passo/

## Recursos

- **Aritmética racional exata** com `BigInt`: nada de `0.30000000000000004`. Decimais digitados viram frações (`0,75` vira `3/4`) e o resultado aparece com frações empilhadas.
- **Determinante** por expansão de Laplace (escolhendo a linha ou coluna com mais zeros, até 4x4), regra de Sarrus (3x3) ou eliminação de Gauss com o controle do sinal a cada troca de linhas.
- **Inversa** por Gauss-Jordan em `[A | I]`, com todas as operações elementares e a conferência `A · A⁻¹ = I`. Se a matriz for singular, a página mostra em que coluna faltou pivô.
- **Posto** pela forma escalonada.
- **Sistemas lineares** de qualquer tamanho até 10x10: escalonamento da matriz aumentada, classificação em SPD, SPI ou SI pelo teorema de Rouché-Capelli, solução paramétrica (com `t`, `s`, ...) e forma vetorial nos sistemas indeterminados.
- **Regra de Cramer** com cada `A_i` destacando a coluna trocada.
- **Decomposição PLU** (`P·A = L·U`), trocando linhas só quando o pivô é zero ou com pivoteamento parcial, e a conferência no final.
- **Polinômio característico e autovalores** de matrizes 2x2 e 3x3: raízes racionais exatas pelo teorema das raízes racionais, raízes irracionais na forma `(5 ± √33)/2`, complexas como `1 ± 2i` e aproximação numérica quando a cúbica não tem raiz racional. Para autovalores racionais, mostra a base do autoespaço, as multiplicidades e se a matriz é diagonalizável.
- **Soma, diferença, produto e transposta**, com cada elemento do produto calculado.
- Entrada em grade ou em texto colado (Excel, LibreOffice, Python, MATLAB, Wolfram), funciona no celular, tema claro e escuro, e lembra a última matriz digitada.

## Como usar

Escolha a operação, digite a matriz (ou clique em um dos exemplos) e a resolução aparece embaixo. Alguns resultados dos exemplos:

| Entrada | Resultado |
|---|---|
| det de `[[2, -1, 3], [1, 0, 4], [-2, 5, 1]]` | Laplace pela linha 2 (que tem um zero): `16 + (-32) = -16` |
| inversa de `[[4, 7], [2, 6]]` | `[[3/5, -7/10], [-1/5, 2/5]]` |
| sistema `2x₁ + x₂ - x₃ = 8`, `-3x₁ - x₂ + 2x₃ = -11`, `-2x₁ + x₂ + 2x₃ = -3` | SPD, `S = {(2, 3, -1)}` |
| sistema `x₁ + 2x₂ - x₃ = 3`, `2x₁ + 4x₂ - 2x₃ = 6`, `x₁ + x₃ = 1` | SPI: `x₁ = 1 - t`, `x₂ = 1 + t`, `x₃ = t` |
| autovalores de `[[1, 2], [3, 4]]` | `λ² - 5λ - 2`, `λ = (5 ± √33)/2` |
| autovalores de `[[2, 0, 0], [0, 3, 4], [0, 4, 9]]` | `1`, `2` e `11`, com autovetores `(0, 2, -1)`, `(1, 0, 0)` e `(0, 1, 2)` |

No modo **Texto**, dá para colar:

```
1 2 3          (uma linha por linha; espaço, tab ou ponto e vírgula entre números)
4 5,5 6        (vírgula é a vírgula decimal: 5,5 = 11/2)

1 2; 3 4                 (uma linha só: o ponto e vírgula separa linhas, como no MATLAB)
[[1, 2], [3, 4]]         (Python e JSON)
{{1, 2}, {3, 4}}         (Wolfram)
2 1 -1 | 8               (sistemas: a barra separa os termos independentes)
```

## Como rodar localmente

Os módulos ES não carregam via `file://`, então sirva a pasta:

```bash
python3 -m http.server 8000
```

e abra http://localhost:8000.

## Testes

```bash
npm test
```

(ou `node --test`; não há dependências para instalar). Os testes cobrem a aritmética de frações (incluindo um teste diferencial contra o `fractions.Fraction` do Python), determinantes conhecidos (Hilbert, Vandermonde, triangulares) e um diferencial contra a fórmula de Leibniz em Python, a concordância entre Laplace, Sarrus e eliminação, `A · A⁻¹ = I` em matrizes aleatórias com semente fixa, posto, a classificação de Rouché-Capelli conferida contra os postos calculados à parte, Cramer igual ao escalonamento, `P·A = L·U` nos dois tipos de pivoteamento, os coeficientes do polinômio característico (conferidos com `det(A - kI)` e com o algoritmo de Faddeev-LeVerrier), autovetores que satisfazem `A·v = λ·v`, a leitura dos formatos de texto e a notação em HTML.

## Como funciona

### Frações exatas

Cada número é um par numerador/denominador de `BigInt`, sempre na forma irredutível (dividindo pelo MDC, calculado pelo algoritmo de Euclides) e com o sinal no numerador. Somar é `a/b + c/d = (ad + cb)/bd`, depois simplifica. Como `BigInt` não tem limite de tamanho, não existe arredondamento: a matriz de Hilbert 4x4, famosa por destruir cálculos em ponto flutuante, tem determinante exatamente `1/6048000` e inversa só com inteiros.

### Operações elementares

Escalonar é aplicar três tipos de operação que não mudam o conjunto solução de um sistema:

- trocar duas linhas: `L1 <-> L3`;
- multiplicar uma linha por um número diferente de zero: `L1 <- (1/2)*L1`;
- somar a uma linha um múltiplo de outra: `L2 <- L2 - 3*L1`.

Na **eliminação de Gauss**, para cada coluna escolhemos um pivô (o primeiro número diferente de zero dali para baixo; se for preciso, trocamos linhas) e zeramos tudo abaixo dele. Na de **Gauss-Jordan**, ainda dividimos a linha do pivô para ele virar 1 e zeramos também acima, chegando à forma escalonada reduzida. O posto é o número de pivôs.

### Determinante

- **Laplace**: `det(A) = Σ a_ij · (-1)^(i+j) · det(M_ij)` ao longo de uma linha ou coluna, em que `M_ij` é a matriz sem a linha `i` e a coluna `j`. Escolher a linha com mais zeros elimina termos. O custo cresce como `n!`, por isso a página usa Laplace só até 4x4.
- **Sarrus**: atalho válido só para 3x3, com três diagonais que somam e três que subtraem.
- **Eliminação**: a operação `L_i <- L_i + k·L_j` não muda o determinante e cada troca de linhas inverte o sinal. Na forma escalonada (triangular), o determinante é o produto da diagonal. São cerca de `n³` operações.

### Inversa

Montamos `[A | I]` e aplicamos Gauss-Jordan. Cada operação elementar equivale a multiplicar à esquerda por uma matriz elementar `E`; se a sequência `E_k ··· E_1` transforma `A` em `I`, então esse produto é `A⁻¹`, e como ele também foi aplicado ao `I` da direita, o lado direito termina igual a `A⁻¹`. Se alguma coluna fica sem pivô, `A` é singular.

### Sistemas: Rouché-Capelli

Escalonamos `[A | b]` e comparamos os postos:

- `posto(A) < posto([A | b])`: aparece uma linha `0 = c` com `c ≠ 0`, o **sistema é impossível (SI)**;
- `posto(A) = posto([A | b]) = n` (número de incógnitas): **possível e determinado (SPD)**, solução única;
- `posto(A) = posto([A | b]) < n`: **possível e indeterminado (SPI)**, com `n - posto` variáveis livres. Cada variável livre vira um parâmetro e as variáveis com pivô são escritas em função deles, o que dá a solução particular mais uma combinação das direções.

A **regra de Cramer** vale quando `A` é quadrada e `det(A) ≠ 0`: `x_i = det(A_i)/det(A)`, com `A_i` igual a `A` com a coluna `i` trocada por `b`. É elegante para 2x2 e 3x3, mas exige `n + 1` determinantes, por isso o escalonamento é preferido em sistemas maiores.

### Decomposição PLU

Fazendo a eliminação de Gauss e guardando cada multiplicador `m_ik = u_ik/u_kk` na posição `(i, k)` de uma matriz `L` (com 1 na diagonal), sobra uma triangular superior `U` e vale `A = L·U`. Quando um pivô é zero, trocamos linhas, e as trocas ficam na matriz de permutação `P`: `P·A = L·U`. Com `L` e `U` em mãos, resolver `A·x = b` para vários `b` custa só duas substituições triangulares. O pivoteamento parcial (pegar o maior módulo da coluna) não é necessário com frações exatas, mas é o que se usa em ponto flutuante para controlar o erro de arredondamento.

### Autovalores

Os autovalores são as raízes de `p(λ) = det(A - λI)`. Para 2x2, `p(λ) = λ² - tr(A)·λ + det(A)`; para 3x3, `p(λ) = -λ³ + tr(A)·λ² - c·λ + det(A)`, em que `c` é a soma dos menores principais 2x2.

Para achar raízes exatas, multiplicamos o polinômio para ter coeficientes inteiros e usamos o **teorema das raízes racionais**: se `p/q` é raiz, `p` divide o termo independente e `q` divide o coeficiente líder. Testamos cada candidato com Briot-Ruffini e dividimos o polinômio a cada raiz. O que sobra de grau 2 sai por Bhaskara, simplificando a raiz (`√72 = 6√2`). Uma cúbica sem raiz racional não se fatora com frações; aí entra uma aproximação numérica pelo método de Durand-Kerner.

Os autovetores de um autovalor racional `λ` são o núcleo de `A - λI`, calculado pela forma escalonada reduzida. A matriz é diagonalizável quando, para cada autovalor, a dimensão do autoespaço (multiplicidade geométrica) é igual ao número de vezes que ele aparece como raiz (multiplicidade algébrica).

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT. Veja [LICENSE](LICENSE).
