import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Frac } from '../src/fracao.js';
import * as M from '../src/matriz.js';

const m = (rows) => M.toMatrix(rows);
const v = (xs) => xs.map(Frac.of);

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

function apply(A, x) {
  return A.map((row) => row.reduce((s, a, j) => s.add(a.mul(x[j])), Frac.ZERO));
}

test('SPD clássico: solução única (2, 3, -1)', () => {
  const r = M.solveSystem(m([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]]), v([8, -11, -3]));
  assert.equal(r.classification, 'SPD');
  assert.deepEqual(r.solution.map(String), ['2', '3', '-1']);
  assert.equal(r.rankA, 3);
  assert.equal(r.rankAb, 3);
});

test('SPI: solução paramétrica satisfaz o sistema para qualquer parâmetro', () => {
  const A = m([[1, 2, -1], [2, 4, -2], [1, 0, 1]]);
  const b = v([3, 6, 1]);
  const r = M.solveSystem(A, b);
  assert.equal(r.classification, 'SPI');
  assert.equal(r.rankA, 2);
  assert.equal(r.rankAb, 2);
  assert.deepEqual(r.free, [2]);
  assert.deepEqual(r.params, ['t']);
  assert.deepEqual(r.particular.map(String), ['1', '1', '0']);
  assert.deepEqual(r.directions.map((d) => d.map(String)), [['-1', '1', '1']]);
  for (const t of [-3, 0, 1, 7, new Frac(5n, 2n)]) {
    const x = r.particular.map((p, i) => p.add(r.directions[0][i].mul(t)));
    assert.deepEqual(apply(A, x).map(String), b.map(String));
  }
});

test('SI: posto(A) < posto([A|b]) e a linha impossível é apontada', () => {
  const r = M.solveSystem(m([[1, 1, 1], [1, -1, 2], [2, 0, 3]]), v([2, 1, 5]));
  assert.equal(r.classification, 'SI');
  assert.equal(r.rankA, 2);
  assert.equal(r.rankAb, 3);
  assert.equal(r.inconsistentRow, 2);
  assert.ok(r.rref[2].slice(0, 3).every((x) => x.isZero()));
  assert.ok(!r.rref[2][3].isZero());
});

test('sistemas retangulares e homogêneos', () => {
  const under = M.solveSystem(m([[1, 1, 1], [0, 1, 2]]), v([6, 5]));
  assert.equal(under.classification, 'SPI');
  assert.equal(under.free.length, 1);
  const overOk = M.solveSystem(m([[1, 0], [0, 1], [1, 1]]), v([2, 3, 5]));
  assert.equal(overOk.classification, 'SPD');
  assert.deepEqual(overOk.solution.map(String), ['2', '3']);
  const overBad = M.solveSystem(m([[1, 0], [0, 1], [1, 1]]), v([2, 3, 6]));
  assert.equal(overBad.classification, 'SI');
  const homog = M.solveSystem(m([[1, 2], [2, 4]]), v([0, 0]));
  assert.equal(homog.classification, 'SPI');
  const zeroOnly = M.solveSystem(m([[1, 2], [3, 4]]), v([0, 0]));
  assert.equal(zeroOnly.classification, 'SPD');
  assert.deepEqual(zeroOnly.solution.map(String), ['0', '0']);
  assert.throws(() => M.solveSystem(m([[1, 2], [3, 4]]), v([1])), /2 elementos/);
});

test('Rouché-Capelli confere com os postos calculados à parte (aleatório)', () => {
  const rand = rng(17);
  const counts = { SPD: 0, SPI: 0, SI: 0 };
  for (let k = 0; k < 150; k++) {
    const rows = 2 + (k % 3);
    const cols = 2 + ((k >> 1) % 3);
    const A = m(Array.from({ length: rows }, () => Array.from({ length: cols }, () => Math.floor(rand() * 5) - 2)));
    const b = v(Array.from({ length: rows }, () => Math.floor(rand() * 5) - 2));
    const r = M.solveSystem(A, b);
    const rA = M.rank(A);
    const rAb = M.rank(A.map((row, i) => [...row, b[i]]));
    assert.equal(r.rankA, rA);
    assert.equal(r.rankAb, rAb);
    const expected = rA < rAb ? 'SI' : rA === cols ? 'SPD' : 'SPI';
    assert.equal(r.classification, expected);
    counts[expected]++;
    if (r.classification === 'SPD') assert.deepEqual(apply(A, r.solution).map(String), b.map(String));
    if (r.classification === 'SPI') {
      assert.equal(r.free.length, cols - rA);
      const x = r.particular.map((p, i) => r.directions.reduce((s, d, j) => s.add(d[i].mul(j + 2)), p));
      assert.deepEqual(apply(A, x).map(String), b.map(String));
    }
  }
  assert.ok(counts.SPD > 0 && counts.SPI > 0 && counts.SI > 0);
});

test('Cramer dá a mesma solução que o escalonamento', () => {
  const rand = rng(23);
  let used = 0;
  for (let k = 0; k < 40; k++) {
    const n = 2 + (k % 4);
    const A = m(Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rand() * 13) - 6)));
    const b = v(Array.from({ length: n }, () => Math.floor(rand() * 13) - 6));
    const c = M.cramer(A, b);
    const g = M.solveSystem(A, b);
    if (!c.applicable) {
      assert.notEqual(g.classification, 'SPD');
      continue;
    }
    used++;
    assert.equal(g.classification, 'SPD');
    assert.deepEqual(c.solution.map(String), g.solution.map(String));
  }
  assert.ok(used > 30);
});

test('Cramer: exemplo e caso não aplicável', () => {
  const c = M.cramer(m([[3, 2], [1, -1]]), v([7, -1]));
  assert.equal(c.detA.toString(), '-5');
  assert.deepEqual(c.columns.map((x) => x.det.toString()), ['-5', '-10']);
  assert.deepEqual(c.solution.map(String), ['1', '2']);
  const no = M.cramer(m([[1, 2], [2, 4]]), v([3, 6]));
  assert.equal(no.applicable, false);
  assert.equal(no.solution, null);
  assert.throws(() => M.cramer(m([[1, 2, 3], [4, 5, 6]]), v([1, 2])), /quadrados/);
});

test('nomes dos parâmetros', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(M.paramName), ['t', 's', 'u', 'v', 'w', 't6', 't7']);
});
