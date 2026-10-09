import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Frac } from '../src/fracao.js';
import * as M from '../src/matriz.js';

const m = (rows) => M.toMatrix(rows);
const str = (A) => A.map((r) => r.map(String));

// gerador com semente fixa (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomMatrix(rand, rows, cols, lo = -6, hi = 6) {
  return m(Array.from({ length: rows }, () => Array.from({ length: cols }, () => Math.floor(rand() * (hi - lo + 1)) + lo)));
}

function hilbert(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => new Frac(1n, BigInt(i + j + 1))));
}

test('validação de formato', () => {
  assert.throws(() => M.toMatrix([]), /vazia/);
  assert.throws(() => M.toMatrix([[1, 2], [3]]), /linha 2 tem 1/);
  assert.throws(() => M.toMatrix(Array.from({ length: 11 }, () => [1])), /máximo/);
});

test('soma, diferença, transposta e produto', () => {
  const A = m([[1, 2], [3, 4]]);
  const B = m([[0, 1], [1, 0]]);
  assert.deepEqual(str(M.add(A, B)), [['1', '3'], ['4', '4']]);
  assert.deepEqual(str(M.sub(A, B)), [['1', '1'], ['2', '4']]);
  assert.deepEqual(str(M.mul(A, B)), [['2', '1'], ['4', '3']]);
  assert.deepEqual(str(M.mul(B, A)), [['3', '4'], ['1', '2']]);
  assert.deepEqual(str(M.transpose(m([[1, 2, 3], [4, 5, 6]]))), [['1', '4'], ['2', '5'], ['3', '6']]);
  assert.throws(() => M.add(A, m([[1, 2, 3]])), /mesmo tamanho/);
  assert.throws(() => M.mul(m([[1, 2, 3]]), A), /número de colunas de A \(3\)/);
  const { entries } = M.productSteps(m([[1, 0, 2], [-1, 3, 1]]), m([[3, 1], [2, 1], [1, 0]]));
  assert.equal(entries[0][0].value.toString(), '5');
  assert.deepEqual(entries[1][0].terms.map(([a, b]) => `${a}*${b}`), ['-1*3', '3*2', '1*1']);
});

test('texto das operações elementares', () => {
  const t = (op) => M.opText(op);
  assert.equal(t({ kind: 'swap', i: 0, j: 2 }), 'L1 <-> L3');
  assert.equal(t({ kind: 'scale', i: 0, factor: new Frac(1n, 2n) }), 'L1 <- (1/2)*L1');
  assert.equal(t({ kind: 'scale', i: 1, factor: new Frac(-1n) }), 'L2 <- -L2');
  assert.equal(t({ kind: 'scale', i: 1, factor: new Frac(-3n) }), 'L2 <- -3*L2');
  assert.equal(t({ kind: 'add', i: 1, j: 0, factor: new Frac(-3n) }), 'L2 <- L2 - 3*L1');
  assert.equal(t({ kind: 'add', i: 2, j: 1, factor: new Frac(1n, 2n) }), 'L3 <- L3 + (1/2)*L2');
  assert.equal(t({ kind: 'add', i: 2, j: 0, factor: new Frac(-1n) }), 'L3 <- L3 - L1');
  assert.equal(t({ kind: 'add', i: 0, j: 2, factor: new Frac(-7n, 4n) }), 'L1 <- L1 - (7/4)*L3');
});

test('cada operação registrada reproduz a matriz seguinte', () => {
  const rand = rng(5);
  for (let k = 0; k < 40; k++) {
    const A = randomMatrix(rand, 2 + (k % 4), 2 + ((k * 7) % 5));
    for (const mode of ['ref', 'rref']) {
      const res = M.eliminate(A, { mode });
      let cur = M.clone(A);
      for (const op of res.ops) {
        if (op.kind === 'swap') [cur[op.i], cur[op.j]] = [cur[op.j], cur[op.i]];
        else if (op.kind === 'scale') cur[op.i] = cur[op.i].map((x) => x.mul(op.factor));
        else cur[op.i] = cur[op.i].map((x, c) => x.add(op.factor.mul(cur[op.j][c])));
        assert.ok(M.equals(cur, op.after), `${mode}: ${op.text}`);
      }
      assert.ok(M.equals(cur, res.matrix));
    }
  }
});

test('forma escalonada reduzida tem pivôs 1 e zeros na coluna do pivô', () => {
  const rand = rng(77);
  for (let k = 0; k < 30; k++) {
    const A = randomMatrix(rand, 3 + (k % 3), 3 + (k % 4));
    const { matrix, pivots } = M.eliminate(A, { mode: 'rref' });
    for (const [r, c] of pivots) {
      assert.ok(matrix[r][c].isOne());
      matrix.forEach((row, i) => { if (i !== r) assert.ok(row[c].isZero()); });
      for (let cc = 0; cc < c; cc++) assert.ok(matrix[r][cc].isZero());
    }
  }
});

test('determinantes conhecidos', () => {
  assert.equal(M.determinant(m([[1, 2], [3, 4]])).toString(), '-2');
  assert.equal(M.determinant(m([[2, -1, 3], [1, 0, 4], [-2, 5, 1]])).toString(), '-16');
  assert.equal(M.determinant(m([[6, 1, 1], [4, -2, 5], [2, 8, 7]])).toString(), '-306');
  assert.equal(M.determinant(M.identity(7)).toString(), '1');
  assert.equal(M.determinant(m([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toString(), '0');
  assert.equal(M.determinant(m([[2, 3, 1, 5], [0, -1, 4, 2], [0, 0, 3, 7], [0, 0, 0, -2]])).toString(), '12');
  assert.equal(M.determinant(m([[0, 1], [1, 0]])).toString(), '-1');
  assert.equal(M.determinant(m([[1, 2, 0, 3], [0, -1, 2, 1], [3, 0, 1, -2], [2, 1, -1, 0]])).toString(), '20');
  // matriz de Hilbert 4x4: det = 1/6048000
  assert.equal(M.determinant(hilbert(4)).toString(), '1/6048000');
  assert.throws(() => M.determinant(m([[1, 2, 3]])), /quadradas/);
});

function hasPython() {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('diferencial: determinante contra a fórmula de Leibniz em Python', { skip: !hasPython() && 'python3 indisponível' }, () => {
  const rand = rng(4242);
  const mats = [];
  for (let k = 0; k < 40; k++) {
    const n = 2 + (k % 5);
    mats.push(Array.from({ length: n }, () => Array.from({ length: n }, () => {
      const num = Math.floor(rand() * 21) - 10;
      const den = 1 + Math.floor(rand() * 4);
      return `${num}/${den}`;
    })));
  }
  const script = [
    'import sys, json',
    'from fractions import Fraction as F',
    'from itertools import permutations',
    'def det(A):',
    '    n = len(A); s = F(0)',
    '    for p in permutations(range(n)):',
    '        inv = sum(1 for i in range(n) for j in range(i + 1, n) if p[i] > p[j])',
    '        prod = F(1)',
    '        for i in range(n): prod *= A[i][p[i]]',
    '        s += (-1) ** inv * prod',
    '    return s',
    'for A in json.load(sys.stdin):',
    '    d = det([[F(x) for x in row] for row in A])',
    "    print(f'{d.numerator}/{d.denominator}')",
  ].join('\n');
  const lines = execFileSync('python3', ['-c', script], { input: JSON.stringify(mats), encoding: 'utf8' }).trim().split('\n');
  mats.forEach((rows, i) => {
    const d = M.determinant(m(rows.map((r) => r.map((x) => Frac.parse(x)))));
    assert.equal(`${d.num}/${d.den}`, lines[i]);
  });
});

test('Vandermonde: det = produto de (x_j - x_i)', () => {
  const xs = [2, -1, 3, 5, 0];
  const V = m(xs.map((x) => xs.map((_, k) => x ** k)));
  let prod = 1;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) prod *= xs[j] - xs[i];
  assert.equal(M.determinant(V).toString(), String(prod));
});

test('Laplace, Sarrus e eliminação concordam (aleatório, semente fixa)', () => {
  const rand = rng(2024);
  for (let k = 0; k < 60; k++) {
    const n = 1 + (k % 4);
    const A = randomMatrix(rand, n, n);
    const ref = M.determinant(A);
    assert.ok(M.detLaplace(A).value.eq(ref));
    assert.ok(M.detElimination(A).value.eq(ref));
    if (n === 3) assert.ok(M.detSarrus(A).value.eq(ref));
  }
});

test('det(AB) = det(A)·det(B) e det(Aᵀ) = det(A)', () => {
  const rand = rng(8);
  for (let k = 0; k < 20; k++) {
    const n = 2 + (k % 4);
    const A = randomMatrix(rand, n, n);
    const B = randomMatrix(rand, n, n);
    assert.ok(M.determinant(M.mul(A, B)).eq(M.determinant(A).mul(M.determinant(B))));
    assert.ok(M.determinant(M.transpose(A)).eq(M.determinant(A)));
  }
});

test('Laplace escolhe a linha ou coluna com mais zeros', () => {
  const A = m([[1, 2, 3], [0, 5, 0], [7, 8, 9]]);
  assert.deepEqual(M.bestLine(A), { kind: 'linha', index: 1, zeros: 2 });
  const B = m([[1, 0, 3], [4, 0, 6], [7, 2, 9]]);
  assert.equal(M.bestLine(B).kind, 'coluna');
  const node = M.detLaplace(A);
  assert.equal(node.terms.filter((t) => t.zero).length, 2);
  assert.equal(node.value.toString(), String(5 * (1 * 9 - 3 * 7)));
});

test('A · A⁻¹ = I para matrizes invertíveis (aleatório, até 6x6)', () => {
  const rand = rng(99);
  let checked = 0;
  for (let k = 0; k < 60; k++) {
    const n = 1 + (k % 6);
    const A = randomMatrix(rand, n, n);
    const res = M.inverse(A);
    assert.equal(res.invertible, !M.determinant(A).isZero());
    if (!res.invertible) continue;
    assert.ok(M.equals(M.mul(A, res.inverse), M.identity(n)));
    assert.ok(M.equals(M.mul(res.inverse, A), M.identity(n)));
    checked++;
  }
  assert.ok(checked > 40);
});

test('inversas conhecidas', () => {
  const res = M.inverse(m([[2, 1, 1], [1, 3, 2], [1, 0, 0]]));
  assert.deepEqual(str(res.inverse), [['0', '0', '1'], ['-2', '1', '3'], ['3', '-1', '-5']]);
  assert.equal(res.ops[0].text, 'L1 <- (1/2)*L1');
  const two = M.inverse(m([[4, 7], [2, 6]]));
  assert.deepEqual(str(two.inverse), [['3/5', '-7/10'], ['-1/5', '2/5']]);
  // a inversa da matriz de Hilbert tem só inteiros
  const h = M.inverse(hilbert(4));
  assert.deepEqual(str(h.inverse), [
    ['16', '-120', '240', '-140'],
    ['-120', '1200', '-2700', '1680'],
    ['240', '-2700', '6480', '-4200'],
    ['-140', '1680', '-4200', '2800'],
  ]);
  const sing = M.inverse(m([[1, 2, 3], [4, 5, 6], [7, 8, 9]]));
  assert.equal(sing.invertible, false);
  assert.deepEqual(sing.missingPivotColumns, [2]);
  assert.equal(sing.rank, 2);
});

test('posto', () => {
  assert.equal(M.rank(m([[0, 0], [0, 0]])), 0);
  assert.equal(M.rank(m([[1, 2], [2, 4]])), 1);
  assert.equal(M.rank(m([[1, 2, 3], [2, 4, 6], [1, 0, 1]])), 2);
  assert.equal(M.rank(m([[1, 2, 0, 1], [2, 4, 1, 3], [3, 6, 1, 4]])), 2);
  assert.equal(M.rank(M.identity(5)), 5);
  assert.equal(M.rank(m([[1, 2, 3, 4, 5]])), 1);
  const rand = rng(3);
  for (let k = 0; k < 30; k++) {
    const A = randomMatrix(rand, 2 + (k % 4), 2 + (k % 5), -2, 2);
    assert.equal(M.rank(A), M.rank(M.transpose(A)), 'posto(A) = posto(Aᵀ)');
  }
});

test('PLU reconstrói A: P·A = L·U', () => {
  const cases = [
    [[0, 2, 1], [1, 1, 1], [2, 1, 0]],
    [[2, 1, 1], [4, 3, 3], [8, 7, 9]],
    [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    [[0, 0, 1], [0, 1, 0], [1, 0, 0]],
    [[0, 0], [0, 0]],
    [[1, 1, 1, 1], [1, 1, 2, 3], [2, 3, 1, 0], [1, 0, 0, 2]],
  ];
  const rand = rng(11);
  for (let k = 0; k < 30; k++) cases.push(randomMatrix(rand, 2 + (k % 5), 2 + (k % 5), -3, 3).map((r) => r.map(Number)));
  for (const rows of cases) {
    const A = m(rows);
    for (const pivoting of ['first', 'partial']) {
      const { P, L, U, perm } = M.plu(A, { pivoting });
      assert.ok(M.equals(M.mul(P, A), M.mul(L, U)), `${pivoting}: ${JSON.stringify(rows)}`);
      const n = A.length;
      for (let i = 0; i < n; i++) {
        assert.ok(L[i][i].isOne());
        for (let j = i + 1; j < n; j++) assert.ok(L[i][j].isZero(), 'L triangular inferior');
        for (let j = 0; j < i; j++) assert.ok(U[i][j].isZero(), 'U triangular superior');
      }
      assert.deepEqual([...perm].sort((a, b) => a - b), [...Array(n).keys()]);
    }
  }
});

test('PLU com pivoteamento parcial deixa multiplicadores com módulo até 1', () => {
  const A = m([[1, 2, 3], [4, 5, 6], [7, 8, 10]]);
  const { L } = M.plu(A, { pivoting: 'partial' });
  for (const row of L) for (const x of row) assert.ok(x.abs().cmp(1) <= 0);
  const swaps = M.plu(A, { pivoting: 'first' }).steps.filter((s) => s.kind === 'swap').length;
  assert.equal(swaps, 0);
});
