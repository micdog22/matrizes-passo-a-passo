import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Frac } from '../src/fracao.js';
import * as M from '../src/matriz.js';
import {
  divideByRoot, divisors, numericRoots, polyEval, polyToString, rationalRoots, solveQuadratic,
} from '../src/polinomio.js';

const m = (rows) => M.toMatrix(rows);
const coeffs = (xs) => xs.map(Frac.of);
const s = (list) => list.map(String);

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

test('coeficientes do polinômio característico p(λ) = det(A - λI)', () => {
  // 2x2: λ² - tr·λ + det
  assert.deepEqual(s(M.characteristicPolynomial(m([[1, 2], [3, 4]])).coeffs), ['-2', '-5', '1']);
  assert.deepEqual(s(M.characteristicPolynomial(m([[0, -1], [1, 0]])).coeffs), ['1', '0', '1']);
  // 3x3: -λ³ + tr·λ² - c·λ + det
  const cp = M.characteristicPolynomial(m([[2, 0, 0], [0, 3, 4], [0, 4, 9]]));
  assert.deepEqual(s(cp.coeffs), ['22', '-35', '14', '-1']);
  assert.equal(cp.trace.toString(), '14');
  assert.equal(cp.minorsSum.toString(), '35');
  assert.deepEqual(s(M.characteristicPolynomial(m([[1, 2, 3], [0, 1, 4], [5, 6, 0]])).coeffs), ['1', '38', '2', '-1']);
  assert.throws(() => M.characteristicPolynomial(M.identity(4)), /2x2 e 3x3/);
});

test('p(k) = det(A - kI) para vários k (aleatório) e confere com Faddeev-LeVerrier', () => {
  const rand = rng(404);
  for (let t = 0; t < 40; t++) {
    const n = 2 + (t % 2);
    const A = m(Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rand() * 13) - 6)));
    const cp = M.characteristicPolynomial(A);
    for (const k of [-3, -1, 0, 1, 2, new Frac(1n, 2n)]) {
      const shifted = M.sub(A, M.scale(M.identity(n), k));
      assert.ok(polyEval(cp.coeffs, k).eq(M.determinant(shifted)));
    }
    // Faddeev-LeVerrier calcula det(λI - A) = (-1)^n · det(A - λI)
    const fl = M.faddeevLeVerrier(A);
    const sign = n % 2 === 0 ? 1 : -1;
    assert.deepEqual(s(fl), s(cp.coeffs.map((c) => c.mul(sign))));
  }
});

test('autovalores racionais e autovetores satisfazem A·v = λ·v', () => {
  const e = M.eigen(m([[2, 0, 0], [0, 3, 4], [0, 4, 9]]));
  assert.deepEqual(e.rational.map((r) => r.value.toString()), ['1', '2', '11']);
  assert.equal(e.other, null);
  assert.equal(e.diagonalizable, true);
  const rand = rng(9);
  const mats = [[[2, 0, 0], [0, 3, 4], [0, 4, 9]], [[4, 1], [2, 3]], [[2, 1, 0], [0, 2, 0], [0, 0, 3]]];
  for (let t = 0; t < 30; t++) {
    // matrizes triangulares têm autovalores racionais (a diagonal)
    const n = 2 + (t % 2);
    mats.push(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (j >= i ? Math.floor(rand() * 9) - 4 : 0))));
  }
  for (const rows of mats) {
    const A = m(rows);
    const e2 = M.eigen(A);
    const total = e2.rational.reduce((acc, r) => acc + r.multiplicity, 0);
    for (const r of e2.rational) {
      assert.ok(r.geometric >= 1 && r.geometric <= r.multiplicity);
      for (const vec of r.basis) {
        const Av = A.map((row) => row.reduce((acc, a, j) => acc.add(a.mul(vec[j])), Frac.ZERO));
        assert.deepEqual(s(Av), s(vec.map((x) => x.mul(r.value))));
        assert.ok(vec.some((x) => !x.isZero()));
      }
    }
    if (rows.every((row, i) => row.every((x, j) => j >= i || x === 0))) assert.equal(total, rows.length);
  }
});

test('raiz dupla com um só autovetor: não diagonalizável', () => {
  const e = M.eigen(m([[2, 1, 0], [0, 2, 0], [0, 0, 3]]));
  assert.deepEqual(e.rational.map((r) => [r.value.toString(), r.multiplicity, r.geometric]), [['2', 2, 1], ['3', 1, 1]]);
  assert.equal(e.diagonalizable, false);
  const id = M.eigen(M.identity(3));
  assert.deepEqual(id.rational.map((r) => [r.value.toString(), r.multiplicity, r.geometric]), [['1', 3, 3]]);
  assert.equal(id.diagonalizable, true);
});

test('autovalores irracionais exatos: (5 ± √33)/2', () => {
  const e = M.eigen(m([[1, 2], [3, 4]]));
  assert.equal(e.rational.length, 0);
  assert.equal(e.other.type, 'quadratic');
  const q = e.other.solution;
  assert.equal(q.kind, 'surd');
  assert.deepEqual([q.p.toString(), q.q.toString(), q.m], ['5/2', '1/2', 33n]);
  assert.ok(Math.abs(q.approx.p + q.approx.q - (5 + Math.sqrt(33)) / 2) < 1e-12);
});

test('autovalores complexos: ±i e 1 ± 2i', () => {
  const e = M.eigen(m([[0, -1], [1, 0]]));
  assert.equal(e.other.solution.kind, 'complex');
  assert.deepEqual([e.other.solution.p.toString(), e.other.solution.q.toString(), e.other.solution.m], ['0', '1', 1n]);
  assert.equal(e.complexRoots, true);
  const f = M.eigen(m([[1, -2], [2, 1]]));
  assert.deepEqual([f.other.solution.p.toString(), f.other.solution.q.toString(), f.other.solution.m], ['1', '2', 1n]);
});

test('cúbica sem raiz racional: aproximações numéricas consistentes', () => {
  const A = m([[1, 2, 3], [0, 1, 4], [5, 6, 0]]);
  const e = M.eigen(A);
  assert.equal(e.rational.length, 0);
  assert.equal(e.other.type, 'numeric');
  const roots = e.other.roots;
  assert.equal(roots.length, 3);
  const sum = roots.reduce((acc, z) => acc + z.re, 0);
  const prod = roots.reduce((acc, z) => acc * z.re, 1);
  assert.ok(Math.abs(sum - 2) < 1e-9, 'soma dos autovalores = traço');
  assert.ok(Math.abs(prod - 1) < 1e-9, 'produto dos autovalores = det');
  for (const z of roots) assert.ok(Math.abs(polyEval(e.coeffs, new Frac(BigInt(Math.round(z.re * 1e12)), 10n ** 12n)).toNumber()) < 1e-6);
});

test('teorema das raízes racionais e Briot-Ruffini', () => {
  // (x - 1)(x - 2)(x + 3) = x³ - 7x + 6
  const r1 = rationalRoots(coeffs([6, -7, 0, 1]));
  assert.deepEqual(r1.roots.map((r) => r.value.toString()), ['-3', '1', '2']);
  // (2x - 1)(3x + 2) = 6x² + x - 2
  const r2 = rationalRoots(coeffs([-2, 1, 6]));
  assert.deepEqual(r2.roots.map((r) => r.value.toString()), ['-2/3', '1/2']);
  // x²(x - 5)² tem 0 e 5 duplos
  const r3 = rationalRoots(coeffs([0, 0, 25, -10, 1]));
  assert.deepEqual(r3.roots.map((r) => [r.value.toString(), r.multiplicity]), [['0', 2], ['5', 2]]);
  // x² - 2 não tem raiz racional
  const r4 = rationalRoots(coeffs([-2, 0, 1]));
  assert.equal(r4.roots.length, 0);
  assert.deepEqual(s(r4.rest), ['-2', '0', '1']);
  const { quotient, remainder } = divideByRoot(coeffs([6, -7, 0, 1]), 1);
  assert.deepEqual(s(quotient), ['-6', '1', '1']);
  assert.ok(remainder.isZero());
  assert.deepEqual(divisors(12n), [1n, 2n, 3n, 4n, 6n, 12n]);
  assert.deepEqual(divisors(-9n), [1n, 3n, 9n]);
});

test('quadráticas exatas', () => {
  assert.deepEqual(s(solveQuadratic(1, -5, 6).roots), ['2', '3']);
  const dbl = solveQuadratic(1, -4, 4);
  assert.equal(dbl.double, true);
  assert.deepEqual(s(dbl.roots), ['2']);
  const surd = solveQuadratic(1, 0, -8); // ±2√2
  assert.deepEqual([surd.kind, surd.p.toString(), surd.q.toString(), surd.m], ['surd', '0', '2', 2n]);
  const frac = solveQuadratic(new Frac(1n, 2n), 0, new Frac(-1n, 3n)); // x² = 2/3 → ±√6/3
  assert.deepEqual([frac.q.toString(), frac.m], ['1/3', 6n]);
});

test('Durand-Kerner encontra raízes reais e complexas', () => {
  const roots = numericRoots([-6, 11, -6, 1]); // 1, 2, 3
  assert.deepEqual(roots.map((z) => Math.round(z.re * 1e9) / 1e9), [1, 2, 3]);
  const cplx = numericRoots([1, 0, 1]); // ±i
  assert.ok(cplx.every((z) => Math.abs(z.re) < 1e-9 && Math.abs(Math.abs(z.im) - 1) < 1e-9));
});

test('texto do polinômio', () => {
  assert.equal(polyToString(coeffs([22, -35, 14, -1])), '-λ³ + 14λ² - 35λ + 22');
  assert.equal(polyToString(coeffs([1, 0, 1])), 'λ² + 1');
  assert.equal(polyToString(coeffs([new Frac(1n, 2n), new Frac(-3n, 4n)]), 'x'), '-(3/4)x + 1/2');
  assert.equal(polyToString(coeffs([0])), '0');
});

test('coeficientes grandes: autovalores racionais recuperados de forma exata', () => {
  const a = M.eigen(m([[10000, 1, 0], [0, 10000, 0], [0, 0, 30000]]));
  assert.equal(a.searchComplete, false);
  assert.deepEqual(a.rational.map((r) => [r.value.toString(), r.multiplicity, r.geometric]), [['10000', 2, 1], ['30000', 1, 1]]);
  assert.equal(a.other, null);
  assert.equal(a.diagonalizable, false);
  const b = M.eigen(m([[1000000, 1], [0, 2000000]]));
  assert.deepEqual(b.rational.map((r) => r.value.toString()), ['1000000', '2000000']);
  assert.equal(b.diagonalizable, true);
});

test('busca incompleta com resto só numérico: sem conclusão sobre diagonalização', () => {
  const e = M.eigen(m([[1000003, 2, 3], [7, 1000033, 4], [5, 6, 1000000]]));
  assert.equal(e.searchComplete, false);
  assert.equal(e.other.type, 'numeric');
  assert.equal(e.diagonalizable, null);
});

test('raiz quadrada simplificada mesmo com discriminante grande', () => {
  // Δ = 10^8 + 4 = 4 · 13² · 147929
  const q = solveQuadratic(1, -10000, -1);
  assert.deepEqual([q.p.toString(), q.q.toString(), q.m], ['5000', '13', 147929n]);
  // Δ = 625000025000000 / 9 = (65000/3)² · 147929, então as raízes são ±(32500/3)·√147929
  const r = solveQuadratic(1, 0, new Frac(-625000025000000n, 36n));
  assert.deepEqual([r.q.toString(), r.m], ['32500/3', 147929n]);
});
