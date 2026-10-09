// Notação matemática em HTML e CSS (sem bibliotecas): frações empilhadas, matrizes com
// colchetes, determinantes com barras, polinômios e raízes. Funções puras, que devolvem texto.
import { Frac } from './fracao.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const absBig = (x) => (x < 0n ? -x : x);

/** Número racional: inteiro simples ou fração empilhada (numerador sobre denominador). */
export function fracHTML(value, { paren = false } = {}) {
  const x = Frac.of(value);
  const sign = x.sign() < 0 ? '-' : '';
  let body;
  if (x.isInteger()) body = `${sign}${absBig(x.num)}`;
  else {
    // a barra escondida faz o texto copiado (e o leitor de tela) sair como "3/4"
    body = `${sign}<span class="fr"><span class="fr-n">${absBig(x.num)}</span><span class="fr-s">/</span><span class="fr-d">${x.den}</span></span>`;
  }
  const html = `<span class="q">${body}</span>`;
  return paren && x.sign() < 0 ? `(${html})` : html;
}

/**
 * Matriz com colchetes (ou barras, para determinante). `bar` desenha a linha vertical da
 * matriz aumentada antes da coluna indicada; `highlight` destaca as linhas alteradas.
 */
export function matrixHTML(M, {
  bar = null, highlight = [], highlightCols = [], det = false, label = '', raw = false,
} = {}) {
  const hl = new Set(highlight);
  const hc = new Set(highlightCols);
  const rows = M.map((row, i) => {
    const cells = row.map((x, j) => {
      const cls = [bar !== null && j === bar ? 'aug' : '', hc.has(j) ? 'hlc' : ''].filter(Boolean).join(' ');
      return `<td${cls ? ` class="${cls}"` : ''}>${raw ? x : fracHTML(x)}</td>`;
    }).join('');
    return `<tr${hl.has(i) ? ' class="hl"' : ''}>${cells}</tr>`;
  }).join('');
  const aria = label ? ` aria-label="${esc(label)}"` : '';
  return `<span class="mtx${det ? ' det' : ''}"${aria}><table><tbody>${rows}</tbody></table></span>`;
}

/** Vetor coluna. */
export function vectorHTML(v, opts = {}) {
  return matrixHTML(v.map((x) => [x]), opts);
}

const SUP = (k) => (k > 1 ? `<sup>${k}</sup>` : '');

/** Polinômio do maior para o menor grau, com a variável em itálico: -λ³ + 6λ² - 11λ + 6. */
export function polyHTML(coeffs, variable = 'λ') {
  const parts = [];
  for (let i = coeffs.length - 1; i >= 0; i--) {
    const k = Frac.of(coeffs[i]);
    if (k.isZero() && coeffs.length > 1) continue;
    const mag = k.abs();
    let body;
    if (i === 0) body = fracHTML(mag);
    else body = `${mag.isOne() ? '' : fracHTML(mag)}<i>${esc(variable)}</i>${SUP(i)}`;
    if (parts.length === 0) parts.push(k.sign() < 0 ? `-${body}` : body);
    else parts.push(`${k.sign() < 0 ? ' - ' : ' + '}${body}`);
  }
  return parts.length ? `<span class="poly">${parts.join('')}</span>` : '<span class="poly">0</span>';
}

/** Raiz quadrada com traço em cima do radicando. */
export function sqrtHTML(m) {
  return `<span class="sqrt">√<span class="rad">${esc(m)}</span></span>`;
}

const fmtNum = (x) => {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0'; // inclui o -0
  const a = Math.abs(x);
  if (a < 1e-4 || a >= 1e15) {
    // notação científica: 1,6534 · 10<sup>-7</sup>
    const [mant, exp] = x.toExponential(4).split('e');
    return `${mant.replace('.', ',')} · 10<sup>${Number(exp)}</sup>`;
  }
  return x.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
};

/** Número decimal no formato brasileiro (vírgula decimal, até 6 casas; muito pequeno ou grande vira potência de 10). */
export function decimalText(x) {
  return fmtNum(x);
}

/**
 * Raízes p ± q·√m (reais) ou p ± q·√m·i (complexas), escritas como (P ± Q√m)/R
 * com P, Q e R inteiros.
 */
export function surdHTML(sol) {
  const den = [sol.p.den, sol.q.den].reduce((a, b) => (a * b) / gcdBig(a, b));
  const P = sol.p.num * (den / sol.p.den);
  const Q = sol.q.num * (den / sol.q.den);
  const i = sol.kind === 'complex' ? '<i>i</i>' : '';
  const radical = sol.m === 1n ? '' : sqrtHTML(sol.m);
  const coef = Q === 1n && (radical || i) ? '' : String(Q);
  const qPart = `${coef}${radical}${i}`;
  const top = P === 0n ? `±${qPart}` : `${P} ± ${qPart}`;
  return den === 1n ? `<span class="surd">${top}</span>` : `<span class="surd">(${top})/${den}</span>`;
}

function gcdBig(a, b) {
  let x = absBig(a);
  let y = absBig(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/** Texto de uma operação elementar (já no formato "L2 <- L2 - 3*L1"). */
export function opHTML(text) {
  return `<code class="op">${esc(text)}</code>`;
}
