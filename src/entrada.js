// Leitura de matrizes coladas como texto.
//
// Formatos aceitos:
//   1 2 3          linhas separadas por quebra de linha; números por espaço, tab ou ponto e vírgula
//   4 5 6          (a vírgula é a vírgula decimal: 1,5 = 3/2)
//   1 2; 3 4       uma linha só, com mais de um número entre os ";": cada ";" separa linhas (MATLAB)
//   [[1, 2], [3, 4]]   listas aninhadas (Python, JSON); aqui a vírgula separa números
//   {{1, 2}, {3, 4}}   chaves (Wolfram)
//   [1 2; 3 4]         colchetes simples (MATLAB/Octave)
//   1 2 | 3        a barra vertical separa a matriz dos termos independentes (matriz aumentada)
import { Frac, ParseError } from './fracao.js';

function parseNumber(token, row, col) {
  try {
    return Frac.parse(token);
  } catch (err) {
    throw new ParseError(`Linha ${row}, coluna ${col}: ${err.message}`);
  }
}

function finish(rawRows) {
  const rows = rawRows.filter((r) => r.length > 0);
  if (rows.length === 0) throw new ParseError('Digite os números da matriz.');
  let bar = null;
  const out = rows.map((tokens, i) => {
    const barAt = tokens.indexOf('|');
    if (tokens.lastIndexOf('|') !== barAt) throw new ParseError(`Linha ${i + 1}: use só uma barra vertical por linha.`);
    const pos = barAt === -1 ? null : barAt;
    if (i === 0) bar = pos;
    else if (pos !== bar) throw new ParseError(`Linha ${i + 1}: a barra vertical precisa estar na mesma posição em todas as linhas.`);
    const nums = tokens.filter((t) => t !== '|');
    return nums.map((t, j) => parseNumber(t, i + 1, j + 1));
  });
  const n = out[0].length;
  out.forEach((r, i) => {
    if (r.length !== n) throw new ParseError(`A linha ${i + 1} tem ${r.length} ${r.length === 1 ? 'número' : 'números'}, mas a primeira tem ${n}.`);
  });
  if (bar === 0 || bar === n) throw new ParseError('A barra vertical precisa ficar entre os coeficientes e os termos independentes.');
  return { rows: out, bar };
}

const splitBar = (s) => s.replace(/\|/g, ' | ');

/** Lê a matriz a partir do texto. Devolve { rows: Frac[][], bar: posição da barra ou null }. */
export function parseMatrixText(text) {
  const src = String(text).trim();
  if (!src) throw new ParseError('Digite os números da matriz.');

  // listas aninhadas: [[1, 2], [3, 4]] ou {{1, 2}, {3, 4}}
  if (/^[[{]\s*[[{]/.test(src)) {
    const groups = [...src.matchAll(/[[{]([^[\]{}]*)[\]}]/g)].map((m) => m[1]);
    if (groups.length === 0) throw new ParseError('Não encontrei as linhas entre colchetes.');
    return finish(groups.map((g) => splitBar(g).split(/[\s,]+/).filter(Boolean)));
  }

  // colchetes simples, estilo MATLAB: [1 2; 3 4]
  if (/^\[/.test(src)) {
    const inner = src.replace(/^\[/, '').replace(/\]$/, '');
    return finish(inner.split(/[;\n]/).map((line) => splitBar(line).split(/[\s,]+/).filter(Boolean)));
  }

  const lines = src.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1 && lines[0].includes(';')) {
    // "1 2; 3 4" vira duas linhas (como no MATLAB); "1;2;3" continua sendo uma linha só
    const chunks = lines[0].split(';').map((chunk) => splitBar(chunk).trim().split(/\s+/).filter(Boolean));
    if (chunks.some((c) => c.filter((t) => t !== '|').length > 1)) return finish(chunks);
  }
  return finish(lines.map((line) => splitBar(line)
    .split(/[\s;]+/)
    .filter(Boolean)
    .map((t) => (t.length > 1 && t.endsWith(',') ? t.slice(0, -1) : t))));
}

/** Escreve a matriz como texto (frações como a/b), com a barra antes da coluna `bar`. */
export function matrixToText(rows, bar = null) {
  return rows.map((row) => row.map((x, j) => (bar !== null && j === bar ? `| ${x}` : String(x))).join(' ')).join('\n');
}
