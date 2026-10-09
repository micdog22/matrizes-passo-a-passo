// Interface: editor de matrizes (grade ou texto) e a resolução passo a passo de cada operação.
import { Frac, ParseError } from './fracao.js';
import { matrixToText, parseMatrixText } from './entrada.js';
import * as M from './matriz.js';
import { divisors, polyEval } from './polinomio.js';
import {
  decimalText, fracHTML, matrixHTML, polyHTML, surdHTML, vectorHTML,
} from './formato.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const STORAGE_KEY = 'matrizes-passo-a-passo:v1';
const F = (x) => fracHTML(x);
const FP = (x) => fracHTML(x, { paren: true });
const Mx = (A, opts) => matrixHTML(A, opts);
const xv = (i) => `<span class="var">x</span><sub>${i + 1}</sub>`;
const LAMBDA = '<i class="var">λ</i>';

// ---------------------------------------------------------------------------
// Operações disponíveis

const OPS = {
  det: {
    help: 'Matriz quadrada. Laplace expande por cofatores; Sarrus usa as diagonais (3x3); a eliminação escalona e multiplica a diagonal.',
    examples: [{ label: 'Exemplo 3x3', rows: [[2, -1, 3], [1, 0, 4], [-2, 5, 1]] }, { label: '4x4', rows: [[1, 2, 0, 3], [0, -1, 2, 1], [3, 0, 1, -2], [2, 1, -1, 0]] }],
  },
  inv: {
    help: 'Matriz quadrada. Gauss-Jordan em [A | I]: quando o lado esquerdo vira I, o direito é a inversa.',
    examples: [{ label: 'Inversa inteira', rows: [[2, 1, 1], [1, 3, 2], [1, 0, 0]] }, { label: 'Com frações', rows: [[4, 7], [2, 6]] }, { label: 'Singular', rows: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }],
  },
  rank: {
    help: 'Qualquer tamanho. O posto é o número de linhas não nulas depois do escalonamento.',
    examples: [{ label: 'Posto 2', rows: [[1, 2, 3], [2, 4, 6], [1, 0, 1]] }, { label: '3x4', rows: [[1, 2, 0, 1], [2, 4, 1, 3], [3, 6, 1, 4]] }],
  },
  sys: {
    augmented: true,
    help: 'Matriz aumentada [A | b]: a última coluna são os termos independentes. Escalonamos e classificamos por Rouché-Capelli.',
    examples: [
      { label: 'SPD', rows: [[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]] },
      { label: 'SPI', rows: [[1, 2, -1, 3], [2, 4, -2, 6], [1, 0, 1, 1]] },
      { label: 'SI', rows: [[1, 1, 1, 2], [1, -1, 2, 1], [2, 0, 3, 5]] },
    ],
  },
  cramer: {
    augmented: true,
    help: 'Sistema quadrado (n equações, n incógnitas) com det(A) diferente de zero.',
    examples: [{ label: 'Exemplo', rows: [[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]] }, { label: '2x2', rows: [[3, 2, 7], [1, -1, -1]] }],
  },
  plu: {
    help: 'Matriz quadrada. P·A = L·U: L guarda os multiplicadores, U é a forma escalonada e P registra as trocas de linha.',
    examples: [{ label: 'Precisa trocar linhas', rows: [[0, 2, 1], [1, 1, 1], [2, 1, 0]] }, { label: 'Sem trocas', rows: [[2, 1, 1], [4, 3, 3], [8, 7, 9]] }],
  },
  eig: {
    help: 'Matriz 2x2 ou 3x3. Os autovalores são as raízes de p(λ) = det(A - λI).',
    examples: [
      { label: 'Racionais', rows: [[2, 0, 0], [0, 3, 4], [0, 4, 9]] },
      { label: 'Raiz quadrada', rows: [[1, 2], [3, 4]] },
      { label: 'Complexos', rows: [[0, -1], [1, 0]] },
      { label: 'Não diagonalizável', rows: [[2, 1, 0], [0, 2, 0], [0, 0, 3]] },
    ],
  },
  arith: {
    needsB: true,
    help: 'Soma e diferença pedem o mesmo tamanho; no produto A·B, as colunas de A precisam ser tantas quanto as linhas de B.',
    examples: [
      { label: 'Soma 2x2', rows: [[1, 2], [3, 4]], rowsB: [[0, 1], [1, 0]], arithOp: 'add' },
      { label: 'Produto 2x3 · 3x2', rows: [[1, 0, 2], [-1, 3, 1]], rowsB: [[3, 1], [2, 1], [1, 0]], arithOp: 'mul' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Editor de matriz

class MatrixEditor {
  constructor(root, { name, onChange }) {
    this.root = root;
    this.name = name;
    this.onChange = onChange;
    this.mode = 'grid';
    this.augmented = false;
    this.cells = [['1', '2'], ['3', '4']];
    this.savedB = null;
    this.build();
  }

  build() {
    const opts = [...Array(M.MAX_SIZE).keys()].map((i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
    this.root.innerHTML = `
      <div class="editor-bar">
        <label class="inline"><span data-k="rows-label">Linhas</span><select data-k="rows">${opts}</select></label>
        <label class="inline"><span data-k="cols-label">Colunas</span><select data-k="cols">${opts}</select></label>
        <div class="tabs" role="group" aria-label="Forma de digitar a matriz ${this.name}">
          <button type="button" data-mode="grid" aria-pressed="true">Grade</button>
          <button type="button" data-mode="text" aria-pressed="false">Texto</button>
        </div>
        <button type="button" class="btn small" data-act="identity">Identidade</button>
        <button type="button" class="btn small" data-act="zero">Zerar</button>
        <button type="button" class="btn small" data-act="random">Aleatória</button>
      </div>
      <div class="grid-wrap" data-k="grid"></div>
      <textarea data-k="text" hidden spellcheck="false" aria-label="Matriz ${this.name} em texto"></textarea>
      <p class="editor-error" data-k="error" aria-live="polite" hidden></p>`;
    this.q = (k) => this.root.querySelector(`[data-k="${k}"]`);
    this.q('rows').addEventListener('change', () => this.resize(Number(this.q('rows').value), this.nCols()));
    this.q('cols').addEventListener('change', () => this.resize(this.cells.length, Number(this.q('cols').value)));
    this.root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
    this.root.querySelector('[data-act="identity"]').addEventListener('click', () => this.fill('identity'));
    this.root.querySelector('[data-act="zero"]').addEventListener('click', () => this.fill('zero'));
    this.root.querySelector('[data-act="random"]').addEventListener('click', () => this.fill('random'));
    this.q('text').addEventListener('input', () => this.changed());
    this.q('grid').addEventListener('input', (ev) => {
      const input = ev.target.closest('input[data-r]');
      if (!input) return;
      this.cells[Number(input.dataset.r)][Number(input.dataset.c)] = input.value;
      this.changed();
    });
    this.q('grid').addEventListener('keydown', (ev) => this.navigate(ev));
  }

  /** Número de colunas da matriz de coeficientes (sem a coluna b). */
  nCols() {
    return this.cells[0].length - (this.augmented ? 1 : 0);
  }

  /** Tenta trazer o texto para as células; em caso de erro, mostra a mensagem e devolve false. */
  trySync() {
    try {
      this.syncFromText();
      return true;
    } catch (err) {
      this.showError(err.message);
      return false;
    }
  }

  setAugmented(flag) {
    if (flag === this.augmented) return;
    if (this.mode === 'text') {
      try {
        const parsed = parseMatrixText(this.q('text').value);
        this.cells = parsed.rows.map((r) => r.map(String));
        if (flag && parsed.bar !== null) {
          // o texto já traz a coluna b (veio com a barra): é só passar a tratar como sistema
          this.augmented = true;
          this.showError('');
          this.q('text').value = matrixToText(this.cells, this.nCols());
          this.render();
          return;
        }
      } catch {
        this.mode = 'grid'; // texto inválido: volta para as últimas células válidas
      }
    }
    if (flag) {
      const b = this.savedB && this.savedB.length === this.cells.length ? this.savedB : this.cells.map(() => '0');
      this.cells = this.cells.map((row, i) => [...row, b[i]]);
    } else {
      this.savedB = this.cells.map((row) => row[row.length - 1]);
      this.cells = this.cells.map((row) => (row.length > 1 ? row.slice(0, -1) : row));
    }
    this.augmented = flag;
    if (this.mode === 'text') this.q('text').value = matrixToText(this.cells, this.augmented ? this.nCols() : null);
    this.render();
  }

  set(rows) {
    this.cells = rows.map((r) => r.map(String));
    this.render();
    this.changed();
  }

  resize(m, n) {
    if (!this.trySync()) return;
    const oldN = this.nCols();
    const next = [];
    for (let i = 0; i < m; i++) {
      const old = this.cells[i];
      const row = [];
      for (let j = 0; j < n; j++) row.push(old && j < oldN ? old[j] : '0');
      if (this.augmented) row.push(old ? old[old.length - 1] : '0');
      next.push(row);
    }
    this.cells = next;
    this.render();
    this.changed();
  }

  fill(kind) {
    if (!this.trySync()) return;
    const n = this.nCols();
    const rnd = () => String(Math.floor(Math.random() * 11) - 5);
    this.cells = this.cells.map((row, i) => row.map((v, j) => {
      if (this.augmented && j === n) return kind === 'random' ? rnd() : kind === 'zero' ? '0' : v;
      if (kind === 'identity') return i === j ? '1' : '0';
      if (kind === 'zero') return '0';
      return rnd();
    }));
    if (this.mode === 'text') this.q('text').value = matrixToText(this.cells, this.augmented ? this.nCols() : null);
    this.render();
    this.changed();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'text') {
      const filled = this.cells.map((row) => row.map((v) => (String(v).trim() === '' ? '0' : String(v).trim())));
      this.q('text').value = matrixToText(filled, this.augmented ? this.nCols() : null);
    } else if (!this.trySync()) {
      return; // o erro aparece embaixo do texto
    }
    this.mode = mode;
    this.showError('');
    this.render();
    this.changed();
  }

  /** Lê o texto (modo texto) para as células; lança se houver erro. */
  syncFromText() {
    if (this.mode !== 'text') return;
    const parsed = this.parseText();
    this.cells = parsed.rows.map((r) => r.map(String));
  }

  parseText() {
    const parsed = parseMatrixText(this.q('text').value);
    if (this.augmented) {
      if (parsed.bar === null && parsed.rows[0].length < 2) throw new ParseError('O sistema precisa de pelo menos uma incógnita e a coluna b.');
      if (parsed.bar !== null && parsed.bar !== parsed.rows[0].length - 1) {
        throw new ParseError('Depois da barra vertical vem só uma coluna (os termos independentes).');
      }
    } else if (parsed.bar !== null) {
      throw new ParseError('A barra vertical só é usada em sistemas lineares.');
    }
    if (parsed.rows.length > M.MAX_SIZE || parsed.rows[0].length - (this.augmented ? 1 : 0) > M.MAX_SIZE) {
      throw new ParseError(`O tamanho máximo é ${M.MAX_SIZE}x${M.MAX_SIZE}.`);
    }
    return parsed;
  }

  navigate(ev) {
    const input = ev.target.closest('input[data-r]');
    if (!input) return;
    let r = Number(input.dataset.r);
    let c = Number(input.dataset.c);
    const m = this.cells.length;
    const w = this.cells[0].length;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      c++;
      if (c >= w) { c = 0; r = (r + 1) % m; }
    } else if (ev.key === 'ArrowDown' && r < m - 1) r++;
    else if (ev.key === 'ArrowUp' && r > 0) r--;
    else return;
    ev.preventDefault();
    const next = this.q('grid').querySelector(`input[data-r="${r}"][data-c="${c}"]`);
    if (next) { next.focus(); next.select(); }
  }

  render() {
    const m = this.cells.length;
    const n = this.nCols();
    this.q('rows').value = String(m);
    this.q('cols').value = String(n);
    this.q('rows-label').textContent = this.augmented ? 'Equações' : 'Linhas';
    this.q('cols-label').textContent = this.augmented ? 'Incógnitas' : 'Colunas';
    this.root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === this.mode)));
    const grid = this.q('grid');
    const text = this.q('text');
    grid.hidden = this.mode !== 'grid';
    text.hidden = this.mode !== 'text';
    this.q('rows').disabled = this.mode === 'text';
    this.q('cols').disabled = this.mode === 'text';
    if (this.mode === 'grid') {
      const w = this.cells[0].length;
      let html = '';
      if (this.augmented) {
        html += this.cells[0].map((_, j) => `<div class="head${j === n ? ' bcol' : ''}">${j === n ? 'b' : `x<sub>${j + 1}</sub>`}</div>`).join('');
      }
      this.cells.forEach((row, i) => {
        row.forEach((v, j) => {
          const isB = this.augmented && j === n;
          const label = isB ? `b, equação ${i + 1}` : `${this.name}, linha ${i + 1}, coluna ${j + 1}`;
          html += `<div${isB ? ' class="bcol"' : ''}><input type="text" autocomplete="off" spellcheck="false" data-r="${i}" data-c="${j}" value="${esc(v)}" placeholder="0" aria-label="${esc(label)}"></div>`;
        });
      });
      grid.innerHTML = `<div class="grid" style="grid-template-columns: repeat(${w}, auto)">${html}</div>`;
    }
  }

  changed() {
    this.onChange();
  }

  /** Matriz lida (frações). Lança ParseError com a posição do problema. */
  read() {
    this.showError('');
    try {
      if (this.mode === 'text') {
        const parsed = this.parseText();
        this.q('rows').value = String(parsed.rows.length);
        this.q('cols').value = String(parsed.rows[0].length - (this.augmented ? 1 : 0));
        return parsed.rows;
      }
      return this.cells.map((row, i) => row.map((v, j) => {
        if (v.trim() === '') return Frac.ZERO;
        try {
          return Frac.parse(v);
        } catch (err) {
          throw new ParseError(`Linha ${i + 1}, coluna ${j + 1}: ${err.message}`);
        }
      }));
    } catch (err) {
      this.showError(err.message);
      throw err;
    }
  }

  showError(msg) {
    const p = this.q('error');
    p.textContent = msg;
    p.hidden = !msg;
  }

  snapshot() {
    try { this.syncFromText(); } catch { /* mantém as células anteriores */ }
    return { cells: this.cells, mode: this.mode, text: this.q('text').value, augmented: this.augmented };
  }

  restore(s) {
    const ok = s && Array.isArray(s.cells) && s.cells.length && Array.isArray(s.cells[0])
      && s.cells.length <= M.MAX_SIZE && s.cells[0].length <= M.MAX_SIZE + 1
      && s.cells.every((r) => Array.isArray(r) && r.length === s.cells[0].length);
    if (!ok) {
      this.render();
      return;
    }
    this.cells = s.cells.map((r) => r.map((v) => String(v)));
    this.augmented = Boolean(s.augmented);
    this.mode = s.mode === 'text' ? 'text' : 'grid';
    this.q('text').value = typeof s.text === 'string' ? s.text : '';
    this.render();
  }
}

// ---------------------------------------------------------------------------
// Peças de exibição

function chainHTML(start, ops, { bar = null } = {}) {
  if (ops.length === 0) {
    return `<div class="chain">${Mx(start, { bar })}</div><p class="muted small">Nenhuma operação foi necessária.</p>`;
  }
  const cells = start.length * start[0].length;
  const parts = ['<div class="chain">', Mx(start, { bar })];
  if (cells <= 60 && ops.length <= 45) {
    for (const op of ops) {
      parts.push(`<span class="step"><span class="arrow"><code class="op">${esc(op.text)}</code></span>${Mx(op.after, { bar, highlight: op.rows })}</span>`);
    }
  } else {
    // matrizes grandes: uma matriz por pivô, com a lista das operações feitas nele
    const groups = [];
    for (const op of ops) {
      const key = op.pivot.join(',');
      if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, ops: [] });
      groups[groups.length - 1].ops.push(op);
    }
    for (const g of groups) {
      const rows = [...new Set(g.ops.flatMap((o) => o.rows))];
      const list = g.ops.map((o) => `<code class="op">${esc(o.text)}</code>`).join('<br>');
      parts.push(`<span class="step"><span class="arrow">${list}</span>${Mx(g.ops[g.ops.length - 1].after, { bar, highlight: rows })}</span>`);
    }
  }
  parts.push('</div>');
  return parts.join('');
}

function errorHTML(msg) {
  return `<div class="error-box">${esc(msg)}</div>`;
}

function badge(text, kind) {
  return `<span class="badge ${kind}">${esc(text)}</span>`;
}

/** Combinação "c + a·t + b·s" com os sinais certos. */
function linearHTML(constant, coefs, names) {
  const parts = [];
  if (!constant.isZero() || coefs.every((c) => c.isZero())) parts.push(F(constant));
  coefs.forEach((c, k) => {
    if (c.isZero()) return;
    const mag = c.abs();
    const body = `${mag.isOne() ? '' : F(mag)}<i class="var">${names[k]}</i>`;
    if (parts.length === 0) parts.push(c.sign() < 0 ? `-${body}` : body);
    else parts.push(c.sign() < 0 ? ` - ${body}` : ` + ${body}`);
  });
  return parts.join('');
}

function equationsHTML(aug, n) {
  const lines = aug.map((row) => {
    const terms = [];
    row.slice(0, n).forEach((a, j) => {
      if (a.isZero()) return;
      const mag = a.abs();
      const body = `${mag.isOne() ? '' : F(mag)}${xv(j)}`;
      if (terms.length === 0) terms.push(a.sign() < 0 ? `-${body}` : body);
      else terms.push(a.sign() < 0 ? ` - ${body}` : ` + ${body}`);
    });
    return `<li>${terms.length ? terms.join('') : '0'} = ${F(row[n])}</li>`;
  });
  return `<ul class="lines math">${lines.join('')}</ul>`;
}

// ---------------------------------------------------------------------------
// Determinante

function laplaceHTML(node) {
  if (node.kind === '1x1') return `<div class="eq">det = ${F(node.value)}</div>`;
  if (node.kind === '2x2') {
    const { a, b, c, d } = node;
    const ad = a.mul(d);
    const bc = b.mul(c);
    return `<div class="eq">${Mx([[a, b], [c, d]], { det: true })} = ${FP(a)}·${FP(d)} - ${FP(b)}·${FP(c)} = ${F(ad)} - ${FP(bc)} = <strong>${F(node.value)}</strong></div>`;
  }
  const where = node.line.kind === 'linha' ? `linha ${node.line.index + 1}` : `coluna ${node.line.index + 1}`;
  const zeros = node.terms.filter((t) => t.zero).length;
  const parts = [`<p>Expansão pela <strong>${where}</strong>${zeros ? ` (a que tem mais zeros: ${zeros}; os termos com zero somem)` : ''}. Cada termo é a<sub>ij</sub> · (-1)<sup>i+j</sup> · det(M<sub>ij</sub>), em que M<sub>ij</sub> é a matriz sem a linha i e a coluna j.</p><ul class="terms">`];
  for (const t of node.terms) {
    const idx = `${t.i + 1}${t.j + 1}`;
    if (t.zero) {
      parts.push(`<li class="muted">a<sub>${idx}</sub> = 0: o termo vale 0.</li>`);
      continue;
    }
    parts.push(`<li><div class="eq">a<sub>${idx}</sub> · (-1)<sup>${t.i + 1}+${t.j + 1}</sup> · det(M<sub>${idx}</sub>) = ${FP(t.a)} · (${t.sign > 0 ? '+1' : '-1'}) · ${Mx(t.minor, { det: true })}</div>`);
    const inner = laplaceHTML(t.sub);
    if (t.sub.kind === 'laplace') parts.push(`<details class="sub"><summary>Calcular det(M<sub>${idx}</sub>) = ${F(t.sub.value)}</summary>${inner}</details>`);
    else parts.push(inner);
    parts.push(`<div class="eq">= ${FP(t.a)} · ${FP(t.cofactor)} = <strong>${F(t.product)}</strong></div></li>`);
  }
  parts.push('</ul>');
  const sum = node.terms.filter((t) => !t.zero).map((t) => FP(t.product)).join(' + ');
  parts.push(`<div class="eq">det = ${sum || '0'} = <strong>${F(node.value)}</strong></div>`);
  return parts.join('');
}

function sarrusHTML(A, s) {
  const ext = A.map((row) => [...row, row[0], row[1]]);
  const prod = (t) => t.map(FP).join('·');
  const down = s.down.map((t, k) => `<li>${prod(t)} = ${F(s.plus[k])}</li>`).join('');
  const up = s.up.map((t, k) => `<li>${prod(t)} = ${F(s.minus[k])}</li>`).join('');
  const sumPlus = s.plus.reduce((x, y) => x.add(y), Frac.ZERO);
  const sumMinus = s.minus.reduce((x, y) => x.add(y), Frac.ZERO);
  return `<p>Repetimos as duas primeiras colunas ao lado. As três diagonais que descem somam; as três que sobem subtraem.</p>
    <div class="scroll">${Mx(ext, { highlightCols: [3, 4] })}</div>
    <div class="eq"><strong>Descendo:</strong></div><ul>${down}</ul>
    <div class="eq"><strong>Subindo:</strong></div><ul>${up}</ul>
    <div class="eq">det = (${F(sumPlus)}) - (${F(sumMinus)}) = <strong>${F(s.value)}</strong></div>`;
}

function renderDet(A) {
  const [m, n] = M.dims(A);
  if (m !== n) return errorHTML(`O determinante só existe para matrizes quadradas. A é ${m}x${n}.`);
  let method = $('det-method').value;
  const notes = [];
  if (method === 'auto') method = n <= 3 ? 'laplace' : 'elim';
  if (method === 'sarrus' && n !== 3) {
    notes.push('A regra de Sarrus vale só para 3x3; usamos Laplace.');
    method = n <= 4 ? 'laplace' : 'elim';
  }
  if (method === 'laplace' && n > 4) {
    notes.push('Laplace em matriz maior que 4x4 tem contas demais para mostrar; usamos a eliminação.');
    method = 'elim';
  }
  const out = [Mx(A, { det: true, label: 'Matriz A' })];
  notes.forEach((t) => out.push(`<p class="muted small">${esc(t)}</p>`));
  let value;
  if (method === 'laplace') {
    const node = M.detLaplace(A);
    value = node.value;
    out.push(laplaceHTML(node));
  } else if (method === 'sarrus') {
    const s = M.detSarrus(A);
    value = s.value;
    out.push(sarrusHTML(A, s));
  } else {
    const r = M.detElimination(A);
    value = r.value;
    out.push('<p>Escalonamos sem dividir linhas. Somar a uma linha um múltiplo de outra não muda o determinante; cada troca de linhas inverte o sinal.</p>');
    out.push(chainHTML(A, r.ops));
    if (r.singular) {
      out.push('<p>Sobrou uma coluna sem pivô: a forma escalonada tem uma linha de zeros, então o determinante é 0.</p>');
    } else {
      const diag = r.diagonal.map(FP).join(' · ');
      out.push(`<div class="eq">det = (-1)<sup>${r.swaps}</sup> · ${diag} = <strong>${F(r.value)}</strong></div>`);
      out.push(`<p class="muted small">${r.swaps === 0 ? 'Nenhuma troca de linhas' : `${r.swaps} ${r.swaps === 1 ? 'troca' : 'trocas'} de linhas`}: o sinal ${r.swaps % 2 ? 'inverte' : 'fica igual'}.</p>`);
    }
  }
  const verdict = value.isZero()
    ? 'Como det(A) = 0, A é singular: não tem inversa e suas linhas são linearmente dependentes.'
    : 'Como det(A) é diferente de zero, A é invertível.';
  out.push(`<div class="callout final">det(A) = <strong>${F(value)}</strong>${value.isInteger() ? '' : ` ≈ ${decimalText(value.toNumber())}`}. ${verdict}</div>`);
  return out.join('');
}

// ---------------------------------------------------------------------------
// Inversa e posto

function renderInverse(A) {
  const [m, n] = M.dims(A);
  if (m !== n) return errorHTML(`Só matrizes quadradas podem ter inversa. A é ${m}x${n}.`);
  const res = M.inverse(A);
  const out = ['<p>Montamos a matriz aumentada [A | I] e aplicamos Gauss-Jordan: pivô 1 em cada coluna e zeros acima e abaixo dele.</p>'];
  out.push(chainHTML(res.start, res.ops, { bar: n }));
  if (!res.invertible) {
    const miss = res.missingPivotColumns.map((c) => c + 1);
    const cols = miss.length === 1 ? `A coluna ${miss[0]} ficou` : `As colunas ${miss.slice(0, -1).join(', ')} e ${miss[miss.length - 1]} ficaram`;
    out.push(`<div class="callout bad"><strong>A não é invertível.</strong> ${cols} sem pivô, então o lado esquerdo não vira a identidade. Isso acontece exatamente quando det(A) = 0 (matriz singular), e o posto de A é ${res.rank}, menor que ${n}.</div>`);
    return out.join('');
  }
  const check = M.mul(A, res.inverse);
  const ok = M.equals(check, M.identity(n));
  out.push(`<div class="callout final"><div class="eq">A<sup>-1</sup> = ${Mx(res.inverse)}</div></div>`);
  out.push(`<h3>Conferência</h3><div class="eq">A · A<sup>-1</sup> = ${Mx(A)} · ${Mx(res.inverse)} = ${Mx(check)} ${ok ? '<span class="ok">✓ identidade</span>' : '<span class="bad">✗</span>'}</div>`);
  return out.join('');
}

function renderRank(A) {
  const res = M.rankSteps(A);
  const [m, n] = M.dims(A);
  const out = ['<p>Escalonamos (eliminação de Gauss): cada pivô é o primeiro número diferente de zero da sua linha, e zeramos tudo abaixo dele.</p>'];
  out.push(chainHTML(A, res.ops));
  const full = res.rank === Math.min(m, n);
  out.push(`<div class="callout final">posto(A) = <strong>${res.rank}</strong>: ${res.rank === 1 ? 'uma linha não nula' : `${res.rank} linhas não nulas`} na forma escalonada. ${full ? `É o maior posto possível para ${m}x${n} (posto completo).` : `Há ${m - res.rank} ${m - res.rank === 1 ? 'linha que é combinação' : 'linhas que são combinações'} das outras.`}</div>`);
  return out.join('');
}

// ---------------------------------------------------------------------------
// Sistemas

function splitAugmented(Ab) {
  const n = Ab[0].length - 1;
  return { A: Ab.map((r) => r.slice(0, n)), b: Ab.map((r) => r[n]), n };
}

function renderSystem(Ab) {
  const { A, b, n } = splitAugmented(Ab);
  const res = M.solveSystem(A, b);
  const out = [`<h3>O sistema</h3>${equationsHTML(res.start, n)}`];
  out.push('<h3>Escalonamento da matriz aumentada [A | b]</h3>');
  out.push(chainHTML(res.start, res.ops, { bar: n }));
  out.push('<h3>Teorema de Rouché-Capelli</h3>');
  out.push(`<p>posto(A) = <strong>${res.rankA}</strong>, posto([A | b]) = <strong>${res.rankAb}</strong> e há <strong>${n}</strong> ${n === 1 ? 'incógnita' : 'incógnitas'}.</p>`);
  if (res.classification === 'SI') {
    const row = res.inconsistentRow + 1;
    out.push(`<div class="callout bad">${badge('SI', 'bad')}<strong>Sistema impossível.</strong> Os postos são diferentes: a linha ${row} virou 0 = ${F(res.rref[res.inconsistentRow][n])}, uma igualdade falsa. Nenhum valor das incógnitas satisfaz todas as equações.</div>`);
    return out.join('');
  }
  if (res.classification === 'SPD') {
    const lines = res.solution.map((v, i) => `<li>${xv(i)} = ${F(v)}</li>`).join('');
    out.push(`<div class="callout ok">${badge('SPD', 'ok')}<strong>Sistema possível e determinado:</strong> posto(A) = posto([A | b]) = n, então a solução é única.</div>`);
    out.push(`<ul class="lines math final">${lines}</ul>`);
    out.push(`<div class="eq">S = {(${res.solution.map(F).join(', ')})}</div>`);
    return out.join('');
  }
  const k = res.free.length;
  out.push(`<div class="callout">${badge('SPI', 'warn')}<strong>Sistema possível e indeterminado:</strong> posto(A) = posto([A | b]) = ${res.rankA} &lt; ${n}, então há infinitas soluções, com ${k} ${k === 1 ? 'variável livre' : 'variáveis livres'} (grau de liberdade ${k}).</div>`);
  const coefRows = [...Array(n).keys()].map((i) => res.directions.map((d) => d[i]));
  const freeText = res.free.map((f, j) => `${xv(f)} = <i class="var">${res.params[j]}</i>`).join(', ');
  out.push(`<p>Variáveis livres viram parâmetros: ${freeText}, com ${res.params.map((p) => `<i class="var">${p}</i>`).join(', ')} ∈ ℝ. As outras saem das linhas com pivô:</p>`);
  const lines = [...Array(n).keys()].map((i) => `<li>${xv(i)} = ${linearHTML(res.particular[i], coefRows[i], res.params)}</li>`).join('');
  out.push(`<ul class="lines math final">${lines}</ul>`);
  const vecs = res.directions.map((d, j) => ` + <i class="var">${res.params[j]}</i>·${vectorHTML(d)}`).join('');
  out.push(`<p>Na forma vetorial (solução particular mais combinação das direções):</p><div class="eq">x = ${vectorHTML(res.particular)}${vecs}</div>`);
  return out.join('');
}

function renderCramer(Ab) {
  const { A, b, n } = splitAugmented(Ab);
  if (A.length !== n) return errorHTML(`A regra de Cramer pede um sistema quadrado: aqui são ${A.length} equações e ${n} incógnitas. Use "Sistema linear".`);
  const res = M.cramer(A, b);
  const out = [`<h3>O sistema</h3>${equationsHTML(Ab, n)}`];
  out.push(`<div class="eq">det(A) = ${Mx(A, { det: true })} = <strong>${F(res.detA)}</strong></div>`);
  if (!res.applicable) {
    out.push('<div class="callout bad"><strong>Cramer não se aplica:</strong> det(A) = 0. O sistema é SPI ou SI; escolha "Sistema linear" para escalonar e classificar.</div>');
    return out.join('');
  }
  out.push('<p>Para cada incógnita, trocamos a coluna dela em A pelo vetor b e calculamos o determinante:</p><ul class="terms">');
  for (const c of res.columns) {
    out.push(`<li><div class="eq">det(A<sub>${c.i + 1}</sub>) = ${Mx(c.matrix, { det: true, highlightCols: [c.i] })} = <strong>${F(c.det)}</strong></div>`
      + `<div class="eq">${xv(c.i)} = det(A<sub>${c.i + 1}</sub>) / det(A) = ${FP(c.det)} / ${FP(res.detA)} = <strong>${F(c.value)}</strong></div></li>`);
  }
  out.push('</ul>');
  out.push(`<div class="callout final">S = {(${res.solution.map(F).join(', ')})}</div>`);
  out.push(`<p class="muted small">Os determinantes foram calculados por eliminação. Para ver as contas de um deles, copie a matriz e use "Determinante".</p>`);
  return out.join('');
}

// ---------------------------------------------------------------------------
// PLU

function renderPLU(A) {
  const [m, n] = M.dims(A);
  if (m !== n) return errorHTML(`A decomposição PLU aqui é para matrizes quadradas. A é ${m}x${n}.`);
  const pivoting = $('plu-pivot').value;
  const res = M.plu(A, { pivoting });
  const out = ['<p>É a eliminação de Gauss guardando as contas: cada multiplicador m<sub>ik</sub> (o número que multiplica a linha do pivô) vai para a posição (i, k) de L, a matriz escalonada final é U, e as trocas de linha ficam registradas em P.</p><ol>'];
  for (const s of res.steps) {
    if (s.kind === 'swap') out.push(`<li><code class="op">${esc(s.text)}</code>${pivoting === 'partial' ? ' (pivô de maior módulo)' : ' (pivô zero)'}: as trocas também valem para os multiplicadores já guardados.<div class="eq">U = ${Mx(s.U, { highlight: [s.k, s.p] })}</div></li>`);
    else if (s.kind === 'mult') out.push(`<li><code class="op">${esc(s.text)}</code> com m<sub>${s.i + 1}${s.k + 1}</sub> = ${F(s.mult)}<div class="eq">U = ${Mx(s.U, { highlight: [s.i] })}</div></li>`);
    else out.push(`<li>${esc(s.text)}</li>`);
  }
  out.push('</ol>');
  if (res.steps.length === 0) out.push('<p class="muted">A já é triangular superior: nenhuma operação foi necessária.</p>');
  out.push(`<div class="callout final"><div class="eq"><span class="piece">P = ${Mx(res.P)}</span><span class="piece">L = ${Mx(res.L)}</span><span class="piece">U = ${Mx(res.U)}</span></div></div>`);
  const PA = M.mul(res.P, A);
  const LU = M.mul(res.L, res.U);
  const ok = M.equals(PA, LU);
  out.push(`<h3>Conferência</h3><div class="eq">P·A = ${Mx(PA)} e L·U = ${Mx(LU)} ${ok ? '<span class="ok">✓ iguais</span>' : '<span class="bad">✗</span>'}</div>`);
  if (res.singular) out.push('<p class="muted small">U tem zero na diagonal: A é singular (det = 0), mas a fatoração continua valendo.</p>');
  else out.push(`<p class="muted small">Como det(P) = ±1 e det(L) = 1, det(A) = det(P) · (produto da diagonal de U) = ${F(M.determinant(A))}.</p>`);
  return out.join('');
}

// ---------------------------------------------------------------------------
// Autovalores

function minusLambdaMatrix(A) {
  return A.map((row, i) => row.map((x, j) => (i === j ? `${x.isZero() ? '' : F(x)} - ${LAMBDA}`.replace(/^ - /, '-') : F(x))));
}

function renderEigen(A) {
  const [m, n] = M.dims(A);
  if (m !== n || (n !== 2 && n !== 3)) return errorHTML(`Polinômio característico e autovalores aqui são para matrizes 2x2 e 3x3. A é ${m}x${n}.`);
  const e = M.eigen(A);
  const out = [`<h3>Polinômio característico</h3><div class="eq">p(${LAMBDA}) = det(A - ${LAMBDA}I) = ${Mx(minusLambdaMatrix(A), { det: true, raw: true })}</div>`];
  if (n === 2) {
    const [[a, b], [c, d]] = A;
    out.push(`<div class="eq">= (${F(a)} - ${LAMBDA})(${F(d)} - ${LAMBDA}) - ${FP(b)}·${FP(c)} = ${polyHTML(e.coeffs)}</div>`);
    out.push(`<p class="muted small">Atalho 2x2: p(λ) = λ² - tr(A)·λ + det(A), com tr(A) = ${F(e.trace)} e det(A) = ${F(e.det)}.</p>`);
  } else {
    out.push(`<p>Para 3x3, p(λ) = -λ³ + tr(A)·λ² - c·λ + det(A), em que tr(A) é a soma da diagonal e c é a soma dos menores principais 2x2 (tirando a linha e a coluna de cada elemento da diagonal).</p>`);
    out.push(`<ul><li>tr(A) = ${F(A[0][0])} + ${FP(A[1][1])} + ${FP(A[2][2])} = ${F(e.trace)}</li>`
      + `<li>c = ${e.principal.map(FP).join(' + ')} = ${F(e.minorsSum)}</li>`
      + `<li>det(A) = ${F(e.det)}</li></ul>`);
    out.push(`<div class="eq">p(${LAMBDA}) = ${polyHTML(e.coeffs)}</div>`);
  }

  out.push('<h3>Raízes de p(λ) = 0</h3>');
  out.push(rootsNarrative(e));

  if (e.rational.length) {
    out.push('<h3>Autovetores</h3><p>Para cada autovalor racional λ, os autovetores são as soluções não nulas de (A - λI)v = 0, ou seja, o núcleo de A - λI.</p><ul class="terms">');
    for (const r of e.rational) {
      const shifted = M.sub(A, M.scale(M.identity(n), r.value));
      const basis = r.basis.map((v) => vectorHTML(v)).join(', ');
      const minus = r.value.isZero() ? 'A' : r.value.isOne() ? 'A - I' : `A - ${FP(r.value)}I`;
      out.push(`<li><div class="eq">${LAMBDA} = ${F(r.value)}: ${minus} = ${Mx(shifted)}</div>`
        + `<div class="eq">base do autoespaço: ${basis || '(vazia)'}</div>`
        + `<p class="small">Multiplicidade algébrica ${r.multiplicity} (vezes que aparece como raiz) e geométrica ${r.geometric} (dimensão do autoespaço).</p></li>`);
    }
    out.push('</ul>');
  }
  if (e.other && e.other.type === 'quadratic') {
    out.push('<p class="muted small">Os autovetores dos autovalores irracionais ou complexos não são mostrados: a ferramenta trabalha só com frações exatas.</p>');
  }
  let verdict;
  if (e.diagonalizable === null) verdict = 'Como parte das raízes foi só aproximada numericamente, não dá para concluir com certeza se A é diagonalizável.';
  else if (!e.diagonalizable) verdict = 'Algum autovalor tem multiplicidade geométrica menor que a algébrica: A <strong>não é diagonalizável</strong>.';
  else if (e.complexRoots) verdict = 'Os autovalores são distintos ou têm autovetores suficientes, então A é diagonalizável sobre os complexos, mas não sobre os reais (há autovalores complexos).';
  else verdict = 'Cada autovalor tem tantos autovetores independentes quanto sua multiplicidade: A é <strong>diagonalizável</strong>.';
  out.push(`<div class="callout final">${verdict}</div>`);
  return out.join('');
}

function rootsNarrative(e) {
  const out = [];
  const coeffs = e.coeffs;
  const L = coeffs.reduce((acc, c) => (acc * c.den) / gcdBig(acc, c.den), 1n);
  let ints = coeffs.map((c) => c.num * (L / c.den));
  if (ints[ints.length - 1] < 0n) ints = ints.map((x) => -x);
  const intPoly = ints.map((x) => new Frac(x));
  let lowIndex = 0;
  while (lowIndex < ints.length - 1 && ints[lowIndex] === 0n) lowIndex++;
  const a0 = ints[lowIndex];
  const an = ints[ints.length - 1];
  out.push(`<div class="eq">${polyHTML(intPoly)} = 0</div>`);
  if (lowIndex > 0) {
    out.push(`<p>O termo independente é 0, então ${LAMBDA} = 0 é raiz${lowIndex > 1 ? ` (${lowIndex === 2 ? 'dupla' : 'tripla'})` : ''}: colocamos ${LAMBDA}${lowIndex > 1 ? `<sup>${lowIndex}</sup>` : ''} em evidência e seguimos com o fator que sobra, cujo termo independente é ${a0}.</p>`);
  }
  const ps = divisors(a0);
  const qs = divisors(an);
  if (!e.searchComplete) {
    out.push('<p>Os coeficientes são grandes demais para listar todos os candidatos do teorema das raízes racionais. Calculamos aproximações numéricas e conferimos com Briot-Ruffini, de forma exata, as que pareciam racionais.</p>');
  } else if (lowIndex < ints.length - 1 && ps && qs) {
    const cands = [];
    for (const p of ps) for (const q of qs) {
      const c = new Frac(p, q);
      if (!cands.some((x) => x.eq(c))) cands.push(c);
    }
    cands.sort((x, y) => x.cmp(y));
    const shown = cands.slice(0, 24).map((c) => `±${F(c)}`).join(', ');
    out.push(`<p><strong>Teorema das raízes racionais:</strong> uma raiz racional p/q precisa ter p dividindo o termo independente (${a0}) e q dividindo o coeficiente líder (${an}). Candidatos: ${shown}${cands.length > 24 ? ` e mais ${cands.length - 24}` : ''}.</p>`);
  }
  const roots = e.rational.filter((r) => !r.value.isZero() || lowIndex === 0);
  if (roots.length) {
    const tested = roots.map((r) => `p(${F(r.value)}) = ${F(polyEval(coeffs, r.value))}`).join(', ');
    out.push(`<p>${e.searchComplete ? 'Testando os candidatos (Briot-Ruffini)' : 'Conferindo'}: ${tested}. ${roots.length === 1 ? 'Essa é raiz' : 'Essas são raízes'}${roots.some((r) => r.multiplicity > 1) ? ', e dividindo de novo vemos a multiplicidade' : ''}.</p>`);
  } else if (lowIndex === 0 || e.other) {
    out.push(e.searchComplete
      ? '<p>Nenhum candidato zera o polinômio: não há autovalor racional.</p>'
      : '<p>Nenhuma aproximação correspondeu a uma raiz racional exata.</p>');
  }
  const items = e.rational.map((r) => `<li>${LAMBDA} = <strong>${F(r.value)}</strong>${r.multiplicity > 1 ? ` (raiz ${r.multiplicity === 2 ? 'dupla' : 'tripla'})` : ''}</li>`);
  if (e.other && e.other.type === 'quadratic') {
    const [c, b, a] = e.other.rest;
    const s = e.other.solution;
    const disc = s.disc;
    out.push(`<p>Sobra o fator ${polyHTML(e.other.rest)}. Por Bhaskara: Δ = b² - 4ac = ${FP(b)}² - 4·${FP(a)}·${FP(c)} = ${F(disc)}${disc.sign() < 0 ? ', negativo: raízes complexas conjugadas' : ', que não é quadrado perfeito: raízes irracionais'}.</p>`);
    let approx = '';
    if (s.m !== 1n) {
      approx = s.kind === 'complex'
        ? ` <span class="muted">(≈ ${decimalText(s.approx.p)} ± ${decimalText(s.approx.q)}i)</span>`
        : ` <span class="muted">(≈ ${decimalText(s.approx.p - s.approx.q)} e ${decimalText(s.approx.p + s.approx.q)})</span>`;
    }
    items.push(`<li>${LAMBDA} = <strong>${surdHTML(s)}</strong>${approx}</li>`);
  } else if (e.other && e.other.type === 'numeric') {
    out.push(e.searchComplete
      ? '<p>A cúbica não tem raiz racional, então não se fatora com frações. Aproximações numéricas (método de Durand-Kerner):</p>'
      : '<p>O fator que sobrou foi resolvido só numericamente (método de Durand-Kerner):</p>');
    for (const z of e.other.roots) {
      items.push(`<li>${LAMBDA} ≈ <strong>${decimalText(z.re)}${z.im ? ` ${z.im < 0 ? '-' : '+'} ${decimalText(Math.abs(z.im))}i` : ''}</strong></li>`);
    }
  }
  out.push(`<p>Autovalores:</p><ul class="final">${items.join('')}</ul>`);
  return out.join('');
}

function gcdBig(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
}

// ---------------------------------------------------------------------------
// Soma, produto, transposta

function renderArith(A, B) {
  const op = $('arith-op').value;
  const out = [];
  try {
    if (op === 'tA') {
      out.push(`<p>A transposta troca linhas por colunas: o elemento (i, j) vai para (j, i).</p><div class="eq">A = ${Mx(A)} A<sup>T</sup> = ${Mx(M.transpose(A))}</div>`);
      return out.join('');
    }
    if (op === 'add' || op === 'sub') {
      const C = op === 'add' ? M.add(A, B) : M.sub(A, B);
      const sym = op === 'add' ? '+' : '-';
      out.push(`<p>Elemento a elemento: c<sub>ij</sub> = a<sub>ij</sub> ${sym} b<sub>ij</sub>.</p><div class="eq">${Mx(A)} ${sym} ${Mx(B)} = <span class="final">${Mx(C)}</span></div>`);
      return out.join('');
    }
    const { result, entries } = M.productSteps(A, B);
    out.push(`<p>Cada c<sub>ij</sub> é a linha i de A "vezes" a coluna j de B: multiplica elemento a elemento e soma. A é ${A.length}x${A[0].length}, B é ${B.length}x${B[0].length}, então A·B é ${result.length}x${result[0].length}.</p>`);
    out.push(`<div class="eq">${Mx(A)} · ${Mx(B)} = <span class="final">${Mx(result)}</span></div>`);
    const list = entries.flat().slice(0, 36).map((e) => `<li>c<sub>${e.i + 1}${e.j + 1}</sub> = ${e.terms.map(([a, b]) => `${FP(a)}·${FP(b)}`).join(' + ')} = <strong>${F(e.value)}</strong></li>`);
    out.push(`<h3>Elemento a elemento</h3><ul>${list.join('')}</ul>`);
    if (entries.flat().length > 36) out.push('<p class="muted small">Mostrando os 36 primeiros elementos.</p>');
    if (A.length === A[0].length && B.length === B[0].length && A.length === B.length) {
      const BA = M.mul(B, A);
      out.push(`<div class="muted small eq">Lembrete: o produto não é comutativo. Aqui B·A = ${Mx(BA)}, ${M.equals(BA, result) ? 'que por acaso é igual a A·B' : 'diferente de A·B'}.</div>`);
    }
  } catch (err) {
    return errorHTML(err.message);
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// Ligação com a página

let editorA;
let editorB;

function currentOp() {
  return document.querySelector('input[name="op"]:checked').value;
}

function compute() {
  const op = currentOp();
  const box = $('result');
  let A;
  let B;
  try {
    A = editorA.read();
    if (OPS[op].needsB) B = editorB.read();
  } catch (err) {
    box.innerHTML = `<p class="muted">Corrija a matriz para ver a resolução.</p>`;
    return;
  }
  try {
    const html = {
      det: () => renderDet(A),
      inv: () => renderInverse(A),
      rank: () => renderRank(A),
      sys: () => renderSystem(A),
      cramer: () => renderCramer(A),
      plu: () => renderPLU(A),
      eig: () => renderEigen(A),
      arith: () => renderArith(A, B),
    }[op]();
    box.innerHTML = html;
    const verdict = box.querySelector('.callout.final, .callout');
    $('result-live').textContent = verdict ? verdict.textContent.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  } catch (err) {
    box.innerHTML = errorHTML(err.message);
    $('result-live').textContent = err.message;
  }
  save();
}

let timer = 0;
function scheduleCompute() {
  clearTimeout(timer);
  timer = setTimeout(compute, 250);
}

function applyOp(op) {
  const meta = OPS[op];
  editorA.setAugmented(Boolean(meta.augmented));
  $('card-b').hidden = !meta.needsB;
  $('op-help').textContent = meta.help;
  document.querySelectorAll('#op-options [data-for]').forEach((el) => { el.hidden = el.dataset.for !== op; });
  $('t-a').textContent = meta.augmented ? 'Sistema: matriz aumentada [A | b]' : 'Matriz A';
  $('examples').innerHTML = meta.examples.map((ex, i) => `<button type="button" class="btn small" data-ex="${i}">${esc(ex.label)}</button>`).join('');
  compute();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      op: currentOp(),
      a: editorA.snapshot(),
      b: editorB.snapshot(),
      det: $('det-method').value,
      plu: $('plu-pivot').value,
      arith: $('arith-op').value,
    }));
  } catch {
    // sem armazenamento: segue normalmente
  }
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function init() {
  editorA = new MatrixEditor($('editor-a'), { name: 'A', onChange: scheduleCompute });
  editorB = new MatrixEditor($('editor-b'), { name: 'B', onChange: scheduleCompute });
  const saved = load();
  const setSelect = (id, v) => {
    if (v && [...$(id).options].some((o) => o.value === v)) $(id).value = v;
  };
  let op = 'det';
  if (saved) {
    if (typeof saved.op === 'string' && Object.prototype.hasOwnProperty.call(OPS, saved.op)) op = saved.op;
    setSelect('det-method', saved.det);
    setSelect('plu-pivot', saved.plu);
    setSelect('arith-op', saved.arith);
    editorA.restore(saved.a);
    editorB.restore(saved.b);
  } else {
    editorA.cells = OPS.det.examples[0].rows.map((r) => r.map(String));
    editorB.cells = [['0', '1'], ['1', '0']];
    editorA.render();
    editorB.render();
  }
  document.querySelector(`input[name="op"][value="${op}"]`).checked = true;
  $('ops').addEventListener('change', () => applyOp(currentOp()));
  for (const id of ['det-method', 'plu-pivot', 'arith-op']) $(id).addEventListener('change', compute);
  $('examples').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-ex]');
    if (!btn) return;
    const ex = OPS[currentOp()].examples[Number(btn.dataset.ex)];
    editorA.mode = 'grid';
    editorA.set(ex.rows);
    if (ex.arithOp) $('arith-op').value = ex.arithOp;
    if (ex.rowsB) {
      editorB.mode = 'grid';
      editorB.set(ex.rowsB);
    }
  });
  applyOp(op);
}

init();
