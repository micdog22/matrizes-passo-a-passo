// Álgebra linear exata: operações, escalonamento com registro das operações elementares,
// determinante (Laplace, Sarrus e eliminação), inversa por Gauss-Jordan, posto,
// sistemas lineares (Rouché-Capelli, solução paramétrica e Cramer), PLU e autovalores.
import { Frac, gcd, lcm } from './fracao.js';
import { divideByRoot, numericRoots, rationalRoots, solveQuadratic } from './polinomio.js';

export const MAX_SIZE = 10;

export class MatrixError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MatrixError';
  }
}

// ---------------------------------------------------------------------------
// Básico

/** Converte uma lista de linhas em matriz de frações, conferindo se é retangular. */
export function toMatrix(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0]) || rows[0].length === 0) {
    throw new MatrixError('A matriz está vazia.');
  }
  const n = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== n) throw new MatrixError(`A linha ${i + 1} tem ${r.length} elementos, mas a primeira tem ${n}.`);
  });
  if (rows.length > MAX_SIZE || n > MAX_SIZE) throw new MatrixError(`O tamanho máximo é ${MAX_SIZE}x${MAX_SIZE}.`);
  return rows.map((r) => r.map(Frac.of));
}

export const dims = (A) => [A.length, A[0].length];

export const clone = (A) => A.map((r) => r.slice());

export function identity(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? Frac.ONE : Frac.ZERO)));
}

export function zeros(m, n) {
  return Array.from({ length: m }, () => Array.from({ length: n }, () => Frac.ZERO));
}

export function equals(A, B) {
  if (A.length !== B.length || A[0].length !== B[0].length) return false;
  return A.every((row, i) => row.every((x, j) => x.eq(B[i][j])));
}

export function isSquare(A) {
  return A.length === A[0].length;
}

export function transpose(A) {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

function sameShape(A, B, what) {
  const [m, n] = dims(A);
  const [p, q] = dims(B);
  if (m !== p || n !== q) throw new MatrixError(`Para ${what}, A e B precisam ter o mesmo tamanho (A é ${m}x${n}, B é ${p}x${q}).`);
}

export function add(A, B) {
  sameShape(A, B, 'somar');
  return A.map((row, i) => row.map((x, j) => x.add(B[i][j])));
}

export function sub(A, B) {
  sameShape(A, B, 'subtrair');
  return A.map((row, i) => row.map((x, j) => x.sub(B[i][j])));
}

export function scale(A, k) {
  const f = Frac.of(k);
  return A.map((row) => row.map((x) => x.mul(f)));
}

export function mul(A, B) {
  const [m, n] = dims(A);
  const [p, q] = dims(B);
  if (n !== p) {
    throw new MatrixError(`Para multiplicar A·B, o número de colunas de A (${n}) precisa ser igual ao de linhas de B (${p}).`);
  }
  const C = zeros(m, q);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < q; j++) {
      let s = Frac.ZERO;
      for (let k = 0; k < n; k++) s = s.add(A[i][k].mul(B[k][j]));
      C[i][j] = s;
    }
  }
  return C;
}

/** Cada elemento do produto com os termos da soma: c_ij = a_i1·b_1j + ... */
export function productSteps(A, B) {
  const C = mul(A, B);
  const entries = C.map((row, i) => row.map((value, j) => ({
    i, j, value, terms: A[i].map((a, k) => [a, B[k][j]]),
  })));
  return { result: C, entries };
}

// ---------------------------------------------------------------------------
// Operações elementares

/** Fator de uma operação: inteiro direto, fração entre parênteses. */
export function formatFactor(k) {
  return k.isInteger() ? k.toString() : `(${k.toString()})`;
}

/**
 * Texto da operação no formato de caderno:
 *   troca: "L1 <-> L2"; multiplicação: "L1 <- (1/2)*L1"; combinação: "L2 <- L2 - 3*L1".
 */
export function opText(op) {
  const L = (i) => `L${i + 1}`;
  if (op.kind === 'swap') return `${L(op.i)} <-> ${L(op.j)}`;
  if (op.kind === 'scale') {
    const k = op.factor;
    if (k.eq(-1)) return `${L(op.i)} <- -${L(op.i)}`;
    return `${L(op.i)} <- ${formatFactor(k)}*${L(op.i)}`;
  }
  const g = op.factor; // L_i <- L_i + g * L_j
  const mag = g.abs();
  const term = mag.isOne() ? L(op.j) : `${formatFactor(mag)}*${L(op.j)}`;
  return `${L(op.i)} <- ${L(op.i)} ${g.sign() < 0 ? '-' : '+'} ${term}`;
}

/**
 * Escalonamento com registro de cada operação elementar.
 *   mode "ref": forma escalonada (Gauss), zera só abaixo do pivô, sem dividir linhas.
 *   mode "rref": forma escalonada reduzida (Gauss-Jordan), pivô 1 e zeros acima e abaixo.
 * `cols` limita as colunas que podem ter pivô (em [A|b], só as de A).
 * `pivoting`: "first" troca linhas só quando o pivô é zero; "partial" escolhe o maior módulo.
 */
export function eliminate(M, { mode = 'rref', cols, pivoting = 'first', record = true } = {}) {
  const A = clone(M);
  const m = A.length;
  const n = A[0].length;
  const lim = Math.min(cols ?? n, n);
  const ops = [];
  const pivots = [];
  let swaps = 0;
  let r = 0;
  const push = (op) => {
    if (record) ops.push({ ...op, text: opText(op), after: clone(A) });
  };
  for (let c = 0; c < lim && r < m; c++) {
    let p = -1;
    if (pivoting === 'partial') {
      let best = null;
      for (let i = r; i < m; i++) {
        if (!A[i][c].isZero() && (!best || A[i][c].abs().cmp(best) > 0)) {
          best = A[i][c].abs();
          p = i;
        }
      }
    } else {
      for (let i = r; i < m; i++) {
        if (!A[i][c].isZero()) {
          p = i;
          break;
        }
      }
    }
    if (p === -1) continue; // coluna sem pivô: variável livre
    if (p !== r) {
      [A[p], A[r]] = [A[r], A[p]];
      swaps++;
      push({ kind: 'swap', i: r, j: p, pivot: [r, c], rows: [r, p] });
    }
    if (mode === 'rref' && !A[r][c].isOne()) {
      const k = A[r][c].inv();
      A[r] = A[r].map((x) => x.mul(k));
      push({ kind: 'scale', i: r, factor: k, pivot: [r, c], rows: [r] });
    }
    for (let i = mode === 'rref' ? 0 : r + 1; i < m; i++) {
      if (i === r || A[i][c].isZero()) continue;
      const f = A[i][c].div(A[r][c]);
      A[i] = A[i].map((x, k) => x.sub(f.mul(A[r][k])));
      push({ kind: 'add', i, j: r, factor: f.neg(), pivot: [r, c], rows: [i] });
    }
    pivots.push([r, c]);
    r++;
  }
  return { matrix: A, ops, pivots, swaps, rank: pivots.length };
}

// ---------------------------------------------------------------------------
// Determinante

/** Menor complementar: tira a linha i e a coluna j. */
export function minorOf(A, i, j) {
  return A.filter((_, r) => r !== i).map((row) => row.filter((__, c) => c !== j));
}

/** Linha ou coluna com mais zeros (menos contas na expansão de Laplace). */
export function bestLine(A) {
  const n = A.length;
  let best = { kind: 'linha', index: 0, zeros: -1 };
  for (let i = 0; i < n; i++) {
    const z = A[i].filter((x) => x.isZero()).length;
    if (z > best.zeros) best = { kind: 'linha', index: i, zeros: z };
  }
  for (let j = 0; j < n; j++) {
    const z = A.filter((row) => row[j].isZero()).length;
    if (z > best.zeros) best = { kind: 'coluna', index: j, zeros: z };
  }
  return best;
}

/**
 * Expansão de Laplace (cofatores) com todos os passos, recursiva.
 * det(A) = soma de a_ij · (-1)^(i+j) · det(M_ij) ao longo de uma linha ou coluna.
 */
export function detLaplace(A) {
  if (!isSquare(A)) throw new MatrixError('O determinante só existe para matrizes quadradas.');
  const n = A.length;
  if (n === 1) return { n, kind: '1x1', value: A[0][0] };
  if (n === 2) {
    const [[a, b], [c, d]] = A;
    return { n, kind: '2x2', a, b, c, d, value: a.mul(d).sub(b.mul(c)) };
  }
  const line = bestLine(A);
  const terms = [];
  let value = Frac.ZERO;
  for (let k = 0; k < n; k++) {
    const i = line.kind === 'linha' ? line.index : k;
    const j = line.kind === 'linha' ? k : line.index;
    const a = A[i][j];
    const sign = (i + j) % 2 === 0 ? 1 : -1;
    if (a.isZero()) {
      terms.push({ i, j, a, sign, zero: true });
      continue;
    }
    const minor = minorOf(A, i, j);
    const sub = detLaplace(minor);
    const cofactor = sign > 0 ? sub.value : sub.value.neg();
    const product = a.mul(cofactor);
    value = value.add(product);
    terms.push({ i, j, a, sign, minor, sub, cofactor, product, zero: false });
  }
  return { n, kind: 'laplace', line, terms, value };
}

/** Regra de Sarrus (só 3x3): três diagonais descendo menos três subindo. */
export function detSarrus(A) {
  if (A.length !== 3 || A[0].length !== 3) throw new MatrixError('A regra de Sarrus vale só para 3x3.');
  const a = A;
  const down = [[a[0][0], a[1][1], a[2][2]], [a[0][1], a[1][2], a[2][0]], [a[0][2], a[1][0], a[2][1]]];
  const up = [[a[0][2], a[1][1], a[2][0]], [a[0][0], a[1][2], a[2][1]], [a[0][1], a[1][0], a[2][2]]];
  const prod = (t) => t[0].mul(t[1]).mul(t[2]);
  const plus = down.map(prod);
  const minus = up.map(prod);
  const value = plus.reduce((s, x) => s.add(x), Frac.ZERO).sub(minus.reduce((s, x) => s.add(x), Frac.ZERO));
  return { down, up, plus, minus, value };
}

/**
 * Determinante por eliminação de Gauss: cada troca de linhas inverte o sinal e
 * L_i <- L_i + k·L_j não muda o determinante. No fim, é o produto da diagonal.
 */
export function detElimination(A) {
  if (!isSquare(A)) throw new MatrixError('O determinante só existe para matrizes quadradas.');
  const res = eliminate(A, { mode: 'ref' });
  const n = A.length;
  const diagonal = res.matrix.map((row, i) => row[i]);
  let value = Frac.ZERO;
  if (res.rank === n) {
    value = diagonal.reduce((s, x) => s.mul(x), Frac.ONE);
    if (res.swaps % 2 === 1) value = value.neg();
  }
  return { ...res, diagonal, value, singular: res.rank < n };
}

/** Só o valor do determinante (eliminação sem registrar passos). */
export function determinant(A) {
  if (!isSquare(A)) throw new MatrixError('O determinante só existe para matrizes quadradas.');
  const res = eliminate(A, { mode: 'ref', record: false });
  if (res.rank < A.length) return Frac.ZERO;
  let v = res.matrix.reduce((s, row, i) => s.mul(row[i]), Frac.ONE);
  if (res.swaps % 2 === 1) v = v.neg();
  return v;
}

// ---------------------------------------------------------------------------
// Inversa e posto

/** Inversa por Gauss-Jordan em [A | I]. Se aparecer coluna sem pivô, A não é invertível. */
export function inverse(A) {
  if (!isSquare(A)) throw new MatrixError('Só matrizes quadradas podem ter inversa.');
  const n = A.length;
  const I = identity(n);
  const aug = A.map((row, i) => [...row, ...I[i]]);
  const res = eliminate(aug, { mode: 'rref', cols: n });
  const invertible = res.rank === n;
  const pivotCols = new Set(res.pivots.map(([, c]) => c));
  const missing = [...Array(n).keys()].filter((c) => !pivotCols.has(c));
  return {
    invertible,
    inverse: invertible ? res.matrix.map((row) => row.slice(n)) : null,
    ops: res.ops,
    start: aug,
    final: res.matrix,
    rank: res.rank,
    missingPivotColumns: missing,
  };
}

/** Posto: número de pivôs na forma escalonada. */
export function rank(A) {
  return eliminate(A, { mode: 'ref', record: false }).rank;
}

export function rankSteps(A) {
  return eliminate(A, { mode: 'ref' });
}

// ---------------------------------------------------------------------------
// Sistemas lineares

export const PARAM_NAMES = ['t', 's', 'u', 'v', 'w'];

export function paramName(k) {
  return k < PARAM_NAMES.length ? PARAM_NAMES[k] : `t${k + 1}`;
}

/**
 * Resolve A·x = b por Gauss-Jordan em [A | b] e classifica pelo teorema de Rouché-Capelli:
 *   posto(A) < posto([A|b])            → SI (sistema impossível)
 *   posto(A) = posto([A|b]) = n        → SPD (possível e determinado)
 *   posto(A) = posto([A|b]) < n        → SPI (possível e indeterminado, n - posto parâmetros)
 */
export function solveSystem(A, b) {
  const m = A.length;
  const n = A[0].length;
  if (b.length !== m) throw new MatrixError(`O vetor b precisa ter ${m} elementos (um por equação).`);
  const aug = A.map((row, i) => [...row, Frac.of(b[i])]);
  const res = eliminate(aug, { mode: 'rref', cols: n });
  const R = res.matrix;
  const rankA = res.rank;
  let inconsistentRow = -1;
  for (let i = rankA; i < m; i++) {
    if (!R[i][n].isZero()) {
      inconsistentRow = i;
      break;
    }
  }
  const rankAb = rankA + (inconsistentRow >= 0 ? 1 : 0);
  const pivotCols = res.pivots.map(([, c]) => c);
  const free = [...Array(n).keys()].filter((c) => !pivotCols.includes(c));
  const out = {
    m, n, start: aug, ops: res.ops, rref: R, rankA, rankAb, pivotCols, free, inconsistentRow,
  };
  if (inconsistentRow >= 0) return { ...out, classification: 'SI' };
  const particular = new Array(n).fill(Frac.ZERO);
  res.pivots.forEach(([r, c]) => { particular[c] = R[r][n]; });
  const directions = free.map((f) => {
    const v = new Array(n).fill(Frac.ZERO);
    v[f] = Frac.ONE;
    res.pivots.forEach(([r, c]) => { v[c] = R[r][f].neg(); });
    return v;
  });
  if (free.length === 0) return { ...out, classification: 'SPD', solution: particular };
  return { ...out, classification: 'SPI', particular, directions, params: free.map((_, k) => paramName(k)) };
}

/** Regra de Cramer: x_i = det(A_i) / det(A), com A_i = A com a coluna i trocada por b. */
export function cramer(A, b) {
  if (!isSquare(A)) throw new MatrixError('A regra de Cramer só vale para sistemas quadrados (n equações e n incógnitas).');
  const n = A.length;
  if (b.length !== n) throw new MatrixError(`O vetor b precisa ter ${n} elementos.`);
  const bb = b.map(Frac.of);
  const detA = determinant(A);
  const columns = [];
  for (let i = 0; i < n; i++) {
    const Ai = A.map((row, r) => row.map((x, c) => (c === i ? bb[r] : x)));
    const detAi = determinant(Ai);
    columns.push({ i, matrix: Ai, det: detAi, value: detA.isZero() ? null : detAi.div(detA) });
  }
  return { applicable: !detA.isZero(), detA, columns, solution: detA.isZero() ? null : columns.map((c) => c.value) };
}

// ---------------------------------------------------------------------------
// Decomposição PLU

/** Matriz de permutação P com P·A = A reordenada por `perm` (linha k de PA = linha perm[k] de A). */
export function permutationMatrix(perm) {
  const n = perm.length;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (__, c) => (c === perm[r] ? Frac.ONE : Frac.ZERO)));
}

/**
 * P·A = L·U, com L triangular inferior de diagonal 1 (os multiplicadores) e U triangular superior.
 * Troca linhas quando o pivô é zero ("first") ou sempre pelo maior módulo ("partial").
 */
export function plu(A, { pivoting = 'first' } = {}) {
  if (!isSquare(A)) throw new MatrixError('A decomposição PLU aqui é para matrizes quadradas.');
  const n = A.length;
  const U = clone(A);
  const L = zeros(n, n);
  const perm = [...Array(n).keys()];
  const steps = [];
  for (let k = 0; k < n; k++) {
    let p = -1;
    if (pivoting === 'partial') {
      let best = null;
      for (let i = k; i < n; i++) {
        if (!U[i][k].isZero() && (!best || U[i][k].abs().cmp(best) > 0)) {
          best = U[i][k].abs();
          p = i;
        }
      }
    } else {
      for (let i = k; i < n; i++) {
        if (!U[i][k].isZero()) {
          p = i;
          break;
        }
      }
    }
    if (p === -1) {
      steps.push({ kind: 'zero', k, text: `Coluna ${k + 1} sem pivô: a matriz é singular, U terá zero na diagonal.`, U: clone(U), L: clone(L) });
      continue;
    }
    if (p !== k) {
      [U[p], U[k]] = [U[k], U[p]];
      [perm[p], perm[k]] = [perm[k], perm[p]];
      for (let c = 0; c < k; c++) [L[p][c], L[k][c]] = [L[k][c], L[p][c]];
      steps.push({ kind: 'swap', k, p, text: opText({ kind: 'swap', i: k, j: p }), U: clone(U), L: clone(L) });
    }
    for (let i = k + 1; i < n; i++) {
      if (U[i][k].isZero()) continue;
      const mult = U[i][k].div(U[k][k]);
      L[i][k] = mult;
      U[i] = U[i].map((x, c) => x.sub(mult.mul(U[k][c])));
      steps.push({ kind: 'mult', i, k, mult, text: opText({ kind: 'add', i, j: k, factor: mult.neg() }), U: clone(U), L: clone(L) });
    }
  }
  for (let i = 0; i < n; i++) L[i][i] = Frac.ONE;
  return { P: permutationMatrix(perm), L, U, perm, steps, singular: U.some((row, i) => row[i].isZero()) };
}

// ---------------------------------------------------------------------------
// Polinômio característico e autovalores

/**
 * p(λ) = det(A - λI), coeficientes do menor para o maior grau.
 *   2x2: λ² - tr(A)·λ + det(A)
 *   3x3: -λ³ + tr(A)·λ² - c·λ + det(A), em que c é a soma dos menores principais 2x2.
 */
export function characteristicPolynomial(A) {
  if (!isSquare(A) || (A.length !== 2 && A.length !== 3)) {
    throw new MatrixError('O polinômio característico aqui é para matrizes 2x2 e 3x3.');
  }
  const n = A.length;
  const tr = A.reduce((s, row, i) => s.add(row[i]), Frac.ZERO);
  const det = determinant(A);
  if (n === 2) return { n, trace: tr, det, minorsSum: null, coeffs: [det, tr.neg(), Frac.ONE] };
  const m2 = (i, j) => A[i][i].mul(A[j][j]).sub(A[i][j].mul(A[j][i]));
  const principal = [m2(1, 2), m2(0, 2), m2(0, 1)];
  const c = principal.reduce((s, x) => s.add(x), Frac.ZERO);
  return { n, trace: tr, det, principal, minorsSum: c, coeffs: [det, c.neg(), tr, Frac.of(-1)] };
}

/** Polinômio característico de qualquer ordem por Faddeev-LeVerrier: det(λI - A). */
export function faddeevLeVerrier(A) {
  const n = A.length;
  const c = new Array(n + 1).fill(Frac.ZERO);
  c[n] = Frac.ONE;
  let M = zeros(n, n);
  const I = identity(n);
  for (let k = 1; k <= n; k++) {
    M = add(mul(A, M), scale(I, c[n - k + 1]));
    const AM = mul(A, M);
    const tr = AM.reduce((s, row, i) => s.add(row[i]), Frac.ZERO);
    c[n - k] = tr.neg().div(k);
  }
  return c;
}

/** Base do núcleo (espaço nulo) com vetores de inteiros quando possível. */
export function nullSpace(M) {
  const n = M[0].length;
  const res = eliminate(M, { mode: 'rref', record: false });
  const pivotCols = res.pivots.map(([, c]) => c);
  const free = [...Array(n).keys()].filter((c) => !pivotCols.includes(c));
  return free.map((f) => {
    const v = new Array(n).fill(Frac.ZERO);
    v[f] = Frac.ONE;
    res.pivots.forEach(([r, c]) => { v[c] = res.matrix[r][f].neg(); });
    return integerVector(v);
  });
}

/** Multiplica o vetor para ter só inteiros primos entre si (mesma direção). */
export function integerVector(v) {
  const L = v.reduce((acc, x) => lcm(acc, x.den), 1n);
  let ints = v.map((x) => x.num * (L / x.den));
  const g = ints.reduce((acc, x) => gcd(acc, x), 0n);
  if (g > 1n) ints = ints.map((x) => x / g);
  const firstNonZero = ints.find((x) => x !== 0n);
  if (firstNonZero !== undefined && firstNonZero < 0n) ints = ints.map((x) => -x);
  return ints.map((x) => new Frac(x));
}

/**
 * Autovalores: raízes racionais exatas; o que sobrar vira quadrática exata (com raiz quadrada
 * ou complexa) ou, numa cúbica sem raiz racional, aproximação numérica.
 * Para autovalores racionais, calcula a base do autoespaço (núcleo de A - λI).
 */
export function eigen(A) {
  const cp = characteristicPolynomial(A);
  const found = rationalRoots(cp.coeffs);
  const roots = found.roots.map((r) => ({ value: r.value, multiplicity: r.multiplicity }));
  const addRoot = (value) => {
    const r = roots.find((x) => x.value.eq(value));
    if (r) r.multiplicity++;
    else roots.push({ value, multiplicity: 1 });
  };
  let { rest } = found;
  const complete = found.complete;
  if (!complete) {
    // Coeficientes grandes demais para listar os divisores: aproximamos as raízes numericamente
    // e conferimos com Briot-Ruffini (exato) as que parecem racionais de denominador pequeno.
    let changed = true;
    while (changed && rest.length > 1) {
      changed = false;
      for (const z of numericRoots(rest.map((c) => c.toNumber()))) {
        for (const den of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 100]) {
          if (!Number.isFinite(z.re)) break;
          const cand = new Frac(BigInt(Math.round(z.re * den)), BigInt(den));
          const { quotient, remainder } = divideByRoot(rest, cand);
          if (remainder.isZero()) {
            addRoot(cand);
            rest = quotient;
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
  }
  let other = null;
  if (rest.length - 1 === 1) {
    addRoot(rest[0].neg().div(rest[1]));
    rest = [rest[1]];
  } else if (rest.length - 1 === 2) {
    const solution = solveQuadratic(rest[2], rest[1], rest[0]);
    if (solution.kind === 'rational') {
      // só acontece quando os coeficientes eram grandes demais para testar todos os candidatos
      for (const r of solution.roots) addRoot(r);
      if (solution.double) addRoot(solution.roots[0]);
    } else other = { type: 'quadratic', rest, solution };
  } else if (rest.length - 1 >= 3) {
    other = { type: 'numeric', rest, roots: numericRoots(rest.map((c) => c.toNumber())) };
  }
  roots.sort((a, b) => a.value.cmp(b.value));
  const n = A.length;
  const I = identity(n);
  const rational = roots.map((r) => {
    const basis = nullSpace(sub(A, scale(I, r.value)));
    return { value: r.value, multiplicity: r.multiplicity, basis, geometric: basis.length };
  });
  const complexRoots = Boolean(other && ((other.type === 'quadratic' && other.solution.kind === 'complex')
    || (other.type === 'numeric' && other.roots.some((z) => z.im !== 0))));
  // As raízes não racionais são simples (vêm de fator irredutível sobre os racionais),
  // então a diagonalização depende só das multiplicidades dos autovalores racionais.
  // Se a busca ficou incompleta e sobrou um fator só aproximado, não dá para afirmar nada.
  const certain = complete || !other || other.type === 'quadratic';
  const diagonalizable = certain ? rational.every((r) => r.geometric === r.multiplicity) : null;
  return { ...cp, rational, other, diagonalizable, complexRoots, searchComplete: complete };
}
