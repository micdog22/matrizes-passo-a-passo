import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  Frac, ParseError, exactSqrt, fracSqrt, gcd, isqrt, lcm, squareFactor,
} from '../src/fracao.js';

const f = (n, d = 1) => new Frac(BigInt(n), BigInt(d));

test('forma irredutível com sinal no numerador', () => {
  assert.equal(f(6, -8).toString(), '-3/4');
  assert.equal(f(-6, -8).toString(), '3/4');
  assert.equal(f(0, -5).toString(), '0');
  assert.equal(f(10, 5).toString(), '2');
  assert.throws(() => f(1, 0), RangeError);
  assert.equal(gcd(12n, -18n), 6n);
  assert.equal(lcm(4n, 6n), 12n);
});

test('aritmética básica', () => {
  assert.equal(f(1, 2).add(f(1, 3)).toString(), '5/6');
  assert.equal(f(1, 2).sub(f(1, 3)).toString(), '1/6');
  assert.equal(f(2, 3).mul(f(9, 4)).toString(), '3/2');
  assert.equal(f(2, 3).div(f(4, 9)).toString(), '3/2');
  assert.equal(f(-2, 3).neg().toString(), '2/3');
  assert.equal(f(-2, 3).inv().toString(), '-3/2');
  assert.equal(f(2, 3).pow(3).toString(), '8/27');
  assert.equal(f(2, 3).pow(-2).toString(), '9/4');
  assert.equal(f(1, 3).add(2).toString(), '7/3');
  assert.throws(() => f(1).div(0), RangeError);
  assert.throws(() => Frac.ZERO.inv(), RangeError);
});

test('comparações', () => {
  assert.equal(f(1, 3).cmp(f(1, 2)), -1);
  assert.equal(f(-1, 2).cmp(f(-2, 3)), 1);
  assert.equal(f(2, 4).cmp(f(1, 2)), 0);
  assert.ok(f(2, 4).eq(f(1, 2)));
  assert.equal(f(-5).sign(), -1);
  assert.ok(Frac.ONE.isOne() && Frac.ZERO.isZero() && f(4, 2).isInteger());
});

test('leitura de inteiros, frações e decimais (vírgula ou ponto)', () => {
  const cases = {
    3: '3', '-2': '-2', '+7': '7', '3/4': '3/4', '-3/4': '-3/4', '6/8': '3/4', '3/-4': '-3/4',
    '0.75': '3/4', '0,75': '3/4', '1,5': '3/2', '.5': '1/2', '-.25': '-1/4', '5.': '5',
    '2.5e-3': '1/400', '1e3': '1000', '-1.2E2': '-120', '0,1': '1/10', '007': '7',
  };
  for (const [src, want] of Object.entries(cases)) assert.equal(Frac.parse(src).toString(), want, src);
});

test('erros de leitura em português', () => {
  assert.throws(() => Frac.parse(''), /vazio/);
  assert.throws(() => Frac.parse('abc'), ParseError);
  assert.throws(() => Frac.parse('1/0'), /denominador zero/);
  assert.throws(() => Frac.parse('1,2,3'), /Separe os valores com espaço/);
  assert.throws(() => Frac.parse('--1'), ParseError);
  assert.throws(() => Frac.parse('√2'), /racional/);
  assert.throws(() => Frac.parse('1e999'), /Expoente/);
});

test('números enormes continuam exatos', () => {
  const big = new Frac(2n ** 200n + 1n, 3n);
  const back = big.mul(3).sub(1);
  assert.equal(back.toString(), (2n ** 200n).toString());
  assert.ok(Math.abs(new Frac(10n ** 400n, 3n * 10n ** 399n).toNumber() - 10 / 3) < 1e-12);
  assert.equal(f(1, 3).toNumber(), 1 / 3);
});

test('raízes quadradas exatas e fator quadrado', () => {
  assert.equal(isqrt(0n), 0n);
  assert.equal(isqrt(99n), 9n);
  assert.equal(isqrt(100n), 10n);
  assert.equal(isqrt(10n ** 40n + 5n), 10n ** 20n);
  assert.equal(exactSqrt(144n), 12n);
  assert.equal(exactSqrt(145n), null);
  assert.equal(fracSqrt(f(9, 16)).toString(), '3/4');
  assert.equal(fracSqrt(f(2, 9)), null);
  assert.equal(fracSqrt(f(-4)), null);
  assert.deepEqual(squareFactor(72n), { k: 6n, m: 2n });
  assert.deepEqual(squareFactor(33n), { k: 1n, m: 33n });
  assert.deepEqual(squareFactor(1n), { k: 1n, m: 1n });
});

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

function hasPython() {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('diferencial contra fractions.Fraction do Python', { skip: !hasPython() && 'python3 indisponível' }, () => {
  const rand = rng(31337);
  const rnd = () => {
    const num = BigInt(Math.floor(rand() * 2e9) - 1e9) * BigInt(Math.floor(rand() * 1e6) + 1);
    const den = BigInt(Math.floor(rand() * 1e9) + 1);
    return new Frac(num, den);
  };
  const ops = ['+', '-', '*', '/'];
  const cases = [];
  for (let i = 0; i < 300; i++) cases.push([rnd(), ops[i % 4], rnd()]);
  const script = [
    'import sys',
    'from fractions import Fraction as F',
    'for line in sys.stdin:',
    '    a, op, b = line.split()',
    '    a, b = F(a), F(b)',
    "    r = a + b if op == '+' else a - b if op == '-' else a * b if op == '*' else a / b",
    "    print(f'{r.numerator}/{r.denominator}')",
  ].join('\n');
  const input = cases.map(([a, op, b]) => `${a.num}/${a.den} ${op} ${b.num}/${b.den}`).join('\n');
  const lines = execFileSync('python3', ['-c', script], { input, encoding: 'utf8' }).trim().split('\n');
  cases.forEach(([a, op, b], i) => {
    const r = op === '+' ? a.add(b) : op === '-' ? a.sub(b) : op === '*' ? a.mul(b) : a.div(b);
    assert.equal(`${r.num}/${r.den}`, lines[i], `${a} ${op} ${b}`);
  });
});

test('fator quadrado de números grandes e sinal de menos tipográfico', () => {
  // 625000025000000 = 5000² · 25000001 = 5000² · 13² · 147929
  assert.deepEqual(squareFactor(625000025000000n), { k: 65000n, m: 147929n });
  assert.deepEqual(squareFactor(2n * 10n ** 18n), { k: 10n ** 9n, m: 2n });
  assert.deepEqual(squareFactor(1000003n ** 2n), { k: 1000003n, m: 1n });
  assert.equal(Frac.parse(`${String.fromCharCode(0x2212)}3/4`).toString(), '-3/4');
});
