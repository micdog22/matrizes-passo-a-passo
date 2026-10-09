// Polinômios com coeficientes racionais exatos: avaliação, divisão por (x - r),
// raízes racionais (teorema das raízes racionais), quadráticas exatas e raízes numéricas.
import { Frac, fracSqrt, gcd as gcdBig, lcm, squareFactor } from './fracao.js';

/** Remove zeros do topo. Coeficientes do menor para o maior grau: [a0, a1, ..., an]. */
export function trim(coeffs) {
  const out = coeffs.map(Frac.of);
  while (out.length > 1 && out[out.length - 1].isZero()) out.pop();
  return out;
}

export function degree(coeffs) {
  return trim(coeffs).length - 1;
}

/** Avaliação pelo método de Horner. */
export function polyEval(coeffs, x) {
  const v = Frac.of(x);
  let acc = Frac.ZERO;
  for (let i = coeffs.length - 1; i >= 0; i--) acc = acc.mul(v).add(coeffs[i]);
  return acc;
}

/** Divisão sintética (Briot-Ruffini) por (x - r): devolve quociente e resto. */
export function divideByRoot(coeffs, r) {
  const root = Frac.of(r);
  const n = coeffs.length - 1;
  const q = new Array(n);
  let acc = Frac.ZERO;
  for (let i = n; i >= 1; i--) {
    acc = acc.mul(root).add(coeffs[i]);
    q[i - 1] = acc;
  }
  const remainder = acc.mul(root).add(coeffs[0]);
  return { quotient: q, remainder };
}

/** Divisores positivos de um inteiro (por tentativa até a raiz). Null se for grande demais. */
export function divisors(n, limit = 10n ** 12n) {
  let m = n < 0n ? -n : n;
  if (m === 0n) return [];
  if (m > limit) return null;
  const small = [];
  const large = [];
  for (let d = 1n; d * d <= m; d++) {
    if (m % d === 0n) {
      small.push(d);
      if (d * d !== m) large.push(m / d);
    }
  }
  return [...small, ...large.reverse()];
}

/**
 * Raízes racionais exatas. Pelo teorema das raízes racionais, se p/q (irredutível) é raiz
 * de um polinômio de coeficientes inteiros, p divide o termo independente e q divide o
 * coeficiente líder. Testamos cada candidato e dividimos o polinômio a cada raiz achada.
 */
export function rationalRoots(coeffs) {
  let poly = trim(coeffs);
  const roots = [];
  const add = (value) => {
    const found = roots.find((r) => r.value.eq(value));
    if (found) found.multiplicity++;
    else roots.push({ value, multiplicity: 1 });
  };
  // raiz zero: termo independente nulo
  while (poly.length > 1 && poly[0].isZero()) {
    add(Frac.ZERO);
    poly = poly.slice(1);
  }
  let complete = true;
  let changed = true;
  while (poly.length > 1 && changed) {
    changed = false;
    const L = poly.reduce((acc, c) => lcm(acc, c.den), 1n);
    const ints = poly.map((c) => c.num * (L / c.den));
    const ps = divisors(ints[0]);
    const qs = divisors(ints[ints.length - 1]);
    if (!ps || !qs) {
      complete = false;
      break;
    }
    const candidates = [];
    const seen = new Set();
    for (const p of ps) {
      for (const q of qs) {
        for (const s of [1n, -1n]) {
          const c = new Frac(s * p, q);
          const key = c.toString();
          if (!seen.has(key)) {
            seen.add(key);
            candidates.push(c);
          }
        }
      }
    }
    candidates.sort((a, b) => a.cmp(b));
    for (const c of candidates) {
      const { quotient, remainder } = divideByRoot(poly, c);
      if (remainder.isZero()) {
        add(c);
        poly = quotient;
        changed = true;
        break;
      }
    }
  }
  roots.sort((a, b) => a.value.cmp(b.value));
  return { roots, rest: poly, complete };
}

/**
 * Raízes exatas de a·x² + b·x + c com coeficientes racionais.
 * Devolve { kind: 'rational', roots } ou { kind: 'surd'|'complex', p, q, m, disc }
 * para raízes p ± q·√m (reais) ou p ± q·√m·i (complexas), com m inteiro livre de quadrados.
 */
export function solveQuadratic(a, b, c) {
  const A = Frac.of(a);
  const B = Frac.of(b);
  const C = Frac.of(c);
  const disc = B.mul(B).sub(A.mul(C).mul(4));
  const twoA = A.mul(2);
  const p = B.neg().div(twoA);
  const root = fracSqrt(disc.abs());
  if (disc.sign() >= 0 && root) {
    const r1 = p.sub(root.div(twoA).abs());
    const r2 = p.add(root.div(twoA).abs());
    return { kind: 'rational', disc, roots: r1.eq(r2) ? [r1] : [r1, r2], double: r1.eq(r2) };
  }
  // √(n/d) = k1·√m1 / (k2·√m2) = k1·√(m1·m2) / (k2·m2), com n = k1²·m1 e d = k2²·m2
  const D = disc.abs();
  const f1 = squareFactor(D.num);
  const f2 = squareFactor(D.den);
  let k = f1.k;
  let m = f1.m * f2.m;
  const g = gcdBig(f1.m, f2.m);
  if (g > 1n) {
    m /= g * g;
    k *= g;
  }
  const q = new Frac(k, f2.k * f2.m).div(twoA).abs();
  const approx = Math.sqrt(D.toNumber()) / Math.abs(twoA.toNumber());
  return { kind: disc.sign() < 0 ? 'complex' : 'surd', disc, p, q, m, approx: { p: p.toNumber(), q: approx } };
}

/**
 * Raízes numéricas (Durand-Kerner) de um polinômio com coeficientes reais (números).
 * Usado só quando não há forma exata simples (cúbica sem raiz racional).
 */
export function numericRoots(coeffsNum) {
  const c = coeffsNum.slice();
  while (c.length > 1 && c[c.length - 1] === 0) c.pop();
  const n = c.length - 1;
  if (n < 1) return [];
  const lead = c[n];
  const a = c.map((x) => x / lead); // mônico
  const mul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
  const sub = (x, y) => [x[0] - y[0], x[1] - y[1]];
  const div = (x, y) => {
    const d = y[0] * y[0] + y[1] * y[1];
    return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d];
  };
  const evalAt = (z) => {
    let acc = [1, 0];
    for (let i = n - 1; i >= 0; i--) acc = [mul(acc, z)[0] + a[i], mul(acc, z)[1]];
    return acc;
  };
  const radius = 1 + Math.max(...a.slice(0, n).map(Math.abs));
  let z = Array.from({ length: n }, (_, k) => {
    const ang = (2 * Math.PI * k) / n + 0.4;
    return [radius * Math.cos(ang), radius * Math.sin(ang)];
  });
  for (let iter = 0; iter < 500; iter++) {
    let delta = 0;
    z = z.map((zi, i) => {
      let den = [1, 0];
      for (let j = 0; j < n; j++) if (j !== i) den = mul(den, sub(zi, z[j]));
      const step = div(evalAt(zi), den);
      delta = Math.max(delta, Math.hypot(step[0], step[1]));
      return sub(zi, step);
    });
    if (delta < 1e-15 * radius) break;
  }
  return z
    .map(([re, im]) => ({ re, im: Math.abs(im) < 1e-9 * Math.max(1, Math.abs(re)) ? 0 : im }))
    .sort((x, y) => x.re - y.re || x.im - y.im);
}

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (k) => String(k).split('').map((d) => SUP[d]).join('');

/** Texto do polinômio do maior para o menor grau: "-λ³ + 6λ² - 11λ + 6". */
export function polyToString(coeffs, variable = 'λ') {
  const c = trim(coeffs);
  const parts = [];
  for (let i = c.length - 1; i >= 0; i--) {
    const k = c[i];
    if (k.isZero() && c.length > 1) continue;
    const absK = k.abs();
    let body;
    if (i === 0) body = absK.toString();
    else {
      const coef = absK.isOne() ? '' : absK.isInteger() ? absK.toString() : `(${absK})`;
      body = `${coef}${variable}${i > 1 ? sup(i) : ''}`;
    }
    if (parts.length === 0) parts.push(k.sign() < 0 ? `-${body}` : body);
    else parts.push(k.sign() < 0 ? `- ${body}` : `+ ${body}`);
  }
  return parts.join(' ');
}
