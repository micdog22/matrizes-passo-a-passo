// Frações exatas com BigInt: numerador e denominador inteiros de qualquer tamanho,
// sempre na forma irredutível e com o sinal no numerador.

const abs = (x) => (x < 0n ? -x : x);
const TYPO_MINUS = String.fromCharCode(0x2212);

export function gcd(a, b) {
  let x = abs(a);
  let y = abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

export function lcm(a, b) {
  if (a === 0n || b === 0n) return 0n;
  return abs(a / gcd(a, b) * b);
}

export class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

export class Frac {
  constructor(num, den = 1n) {
    let n = BigInt(num);
    let d = BigInt(den);
    if (d === 0n) throw new RangeError('Divisão por zero.');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    if (g > 1n) {
      n /= g;
      d /= g;
    }
    this.num = n;
    this.den = d;
    Object.freeze(this);
  }

  /** Converte número inteiro, BigInt, texto ou Frac. */
  static of(x) {
    if (x instanceof Frac) return x;
    if (typeof x === 'bigint') return new Frac(x);
    if (typeof x === 'number') {
      if (!Number.isInteger(x)) return Frac.parse(String(x));
      return new Frac(BigInt(x));
    }
    return Frac.parse(String(x));
  }

  /**
   * Lê "3", "-2", "3/4", "-3/4", "0.75", "1,5" (vírgula decimal), ".5", "2.5e-3".
   * Lança ParseError com mensagem em português.
   */
  static parse(text) {
    // sinal de menos tipográfico (comum ao colar de PDF) vira o hífen comum
    const s = String(text).trim().split(TYPO_MINUS).join('-').replace(/^\+/, '');
    if (s === '') throw new ParseError('Valor vazio.');
    const frac = /^(-?\d+)\s*\/\s*(-?\d+)$/.exec(s);
    if (frac) {
      if (BigInt(frac[2]) === 0n) throw new ParseError(`"${text}" tem denominador zero.`);
      return new Frac(BigInt(frac[1]), BigInt(frac[2]));
    }
    const dec = /^(-)?(\d*)(?:[.,](\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
    if (dec && (dec[2] || dec[3])) {
      const sign = dec[1] ? -1n : 1n;
      const intPart = dec[2] || '0';
      const fracPart = dec[3] || '';
      let num = BigInt(intPart + fracPart) * sign;
      let den = 10n ** BigInt(fracPart.length);
      const exp = dec[4] ? Number(dec[4]) : 0;
      if (Math.abs(exp) > 400) throw new ParseError(`Expoente grande demais em "${text}".`);
      if (exp > 0) num *= 10n ** BigInt(exp);
      else if (exp < 0) den *= 10n ** BigInt(-exp);
      return new Frac(num, den);
    }
    if (/^-?\d+[.,]\d+[.,]/.test(s)) {
      throw new ParseError(`"${text}" não é um número. Separe os valores com espaço; a vírgula aqui é a vírgula decimal.`);
    }
    throw new ParseError(`"${text}" não é um número racional válido (use inteiros, frações como 3/4 ou decimais como 0,75).`);
  }

  static get ZERO() { return ZERO; }

  static get ONE() { return ONE; }

  add(o) {
    const b = Frac.of(o);
    return new Frac(this.num * b.den + b.num * this.den, this.den * b.den);
  }

  sub(o) {
    const b = Frac.of(o);
    return new Frac(this.num * b.den - b.num * this.den, this.den * b.den);
  }

  mul(o) {
    const b = Frac.of(o);
    return new Frac(this.num * b.num, this.den * b.den);
  }

  div(o) {
    const b = Frac.of(o);
    if (b.num === 0n) throw new RangeError('Divisão por zero.');
    return new Frac(this.num * b.den, this.den * b.num);
  }

  neg() { return new Frac(-this.num, this.den); }

  inv() { return Frac.ONE.div(this); }

  abs() { return this.num < 0n ? this.neg() : this; }

  pow(k) {
    if (!Number.isInteger(k)) throw new RangeError('Expoente inteiro esperado.');
    if (k < 0) return this.inv().pow(-k);
    return new Frac(this.num ** BigInt(k), this.den ** BigInt(k));
  }

  sign() { return this.num > 0n ? 1 : this.num < 0n ? -1 : 0; }

  isZero() { return this.num === 0n; }

  isOne() { return this.num === 1n && this.den === 1n; }

  isInteger() { return this.den === 1n; }

  eq(o) {
    const b = Frac.of(o);
    return this.num === b.num && this.den === b.den;
  }

  cmp(o) {
    const b = Frac.of(o);
    const d = this.num * b.den - b.num * this.den;
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  }

  /** Texto simples: "3", "-3/4". */
  toString() {
    return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`;
  }

  /** Aproximação em ponto flutuante (funciona mesmo com numerador e denominador enormes). */
  toNumber() {
    const n = this.num;
    const d = this.den;
    const bits = Math.max(n.toString(2).length, d.toString(2).length);
    if (bits < 1000) return Number(n) / Number(d);
    const shift = BigInt(bits - 900);
    return Number(n >> shift) / Number(d >> shift);
  }
}

const ZERO = new Frac(0n);
const ONE = new Frac(1n);

/** Raiz quadrada exata de um inteiro não negativo, ou null se não for quadrado perfeito. */
export function isqrt(n) {
  if (n < 0n) throw new RangeError('Raiz de número negativo.');
  if (n < 2n) return n;
  // Newton a partir de um chute maior que a raiz: 2^(metade dos bits, arredondada para cima)
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

export function exactSqrt(n) {
  const r = isqrt(n);
  return r * r === n ? r : null;
}

/** Raiz quadrada exata de uma fração não negativa, ou null. */
export function fracSqrt(f) {
  if (f.sign() < 0) return null;
  const a = exactSqrt(f.num);
  const b = exactSqrt(f.den);
  return a !== null && b !== null ? new Frac(a, b) : null;
}

/**
 * Tira o maior quadrado que conseguir de n: n = k² · m. Divide por primos até 100000 (para
 * números enormes, m pode ainda ter o quadrado de um primo maior) e confere se o que sobrou
 * é um quadrado perfeito.
 */
export function squareFactor(n) {
  let m = abs(n);
  let k = 1n;
  for (let p = 2n; p <= 100000n && p * p <= m; p += p === 2n ? 1n : 2n) {
    const pp = p * p;
    while (m % pp === 0n) {
      m /= pp;
      k *= p;
    }
  }
  const r = exactSqrt(m);
  if (r !== null && r > 1n) {
    k *= r;
    m = 1n;
  }
  return { k, m };
}
