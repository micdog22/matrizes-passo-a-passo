import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Frac, ParseError } from '../src/fracao.js';
import { matrixToText, parseMatrixText } from '../src/entrada.js';
import { decimalText, fracHTML, matrixHTML, polyHTML, surdHTML } from '../src/formato.js';
import { solveQuadratic } from '../src/polinomio.js';

const rows = (text) => parseMatrixText(text).rows.map((r) => r.map(String));

test('texto simples: espaços, tabs, ponto e vírgula em várias linhas', () => {
  assert.deepEqual(rows('1 2 3\n4 5 6'), [['1', '2', '3'], ['4', '5', '6']]);
  assert.deepEqual(rows('1\t2\n3\t4\n'), [['1', '2'], ['3', '4']]);
  assert.deepEqual(rows('1;2;3\n4;5;6'), [['1', '2', '3'], ['4', '5', '6']]);
  assert.deepEqual(rows('  1   -2 \n\n 3/4  0,5  '), [['1', '-2'], ['3/4', '1/2']]);
});

test('vírgula é decimal; vírgula no fim do número é separador', () => {
  assert.deepEqual(rows('1,5 2\n3 4,25'), [['3/2', '2'], ['3', '17/4']]);
  assert.deepEqual(rows('1, 2, 3\n4, 5, 6'), [['1', '2', '3'], ['4', '5', '6']]);
  assert.throws(() => parseMatrixText('1,2,3'), /Separe os valores com espaço/);
});

test('uma linha com ponto e vírgula separa linhas (estilo MATLAB) quando há mais de um número entre eles', () => {
  assert.deepEqual(rows('1 2; 3 4'), [['1', '2'], ['3', '4']]);
  assert.deepEqual(rows('1;2;3'), [['1', '2', '3']]);
  assert.deepEqual(rows('1 2 | 3; 4 5 | 6'), [['1', '2', '3'], ['4', '5', '6']]);
});

test('listas aninhadas e colchetes', () => {
  assert.deepEqual(rows('[[1, 2], [3, 4]]'), [['1', '2'], ['3', '4']]);
  assert.deepEqual(rows('[[1.5, -2],\n [0.25, 4]]'), [['3/2', '-2'], ['1/4', '4']]);
  assert.deepEqual(rows('{{1, 2}, {3, 4}}'), [['1', '2'], ['3', '4']]);
  assert.deepEqual(rows('[1 2; 3 4]'), [['1', '2'], ['3', '4']]);
  assert.deepEqual(rows('[1, 2; 3, 4]'), [['1', '2'], ['3', '4']]);
});

test('barra vertical da matriz aumentada', () => {
  const p = parseMatrixText('2 1 -1 | 8\n-3 -1 2 | -11\n-2 1 2 | -3');
  assert.equal(p.bar, 3);
  assert.deepEqual(p.rows.map((r) => r.map(String)), [['2', '1', '-1', '8'], ['-3', '-1', '2', '-11'], ['-2', '1', '2', '-3']]);
  assert.equal(parseMatrixText('1 2|3\n4 5|6').bar, 2);
  assert.throws(() => parseMatrixText('1 2 | 3\n4 | 5 6'), /mesma posição/);
  assert.throws(() => parseMatrixText('| 1 2\n| 3 4'), /entre os coeficientes/);
  assert.throws(() => parseMatrixText('1 | 2 | 3'), /só uma barra/);
});

test('erros apontam linha e coluna', () => {
  assert.throws(() => parseMatrixText(''), /Digite/);
  assert.throws(() => parseMatrixText('1 2\n3'), /linha 2 tem 1 número, mas a primeira tem 2/);
  try {
    parseMatrixText('1 2\n3 x');
    assert.fail('deveria falhar');
  } catch (err) {
    assert.ok(err instanceof ParseError);
    assert.match(err.message, /^Linha 2, coluna 2:/);
  }
});

test('ida e volta pelo texto', () => {
  const text = '1 -1/2 3\n0 2 7/3';
  assert.equal(matrixToText(parseMatrixText(text).rows), text);
  const aug = parseMatrixText('1 2 | 3\n4 5 | 6');
  assert.equal(matrixToText(aug.rows, aug.bar), '1 2 | 3\n4 5 | 6');
});

test('notação em HTML: frações, matrizes, polinômios e raízes', () => {
  assert.equal(fracHTML(new Frac(-3n)), '<span class="q">-3</span>');
  const half = fracHTML(new Frac(-1n, 2n));
  assert.equal(half, '<span class="q">-<span class="fr"><span class="fr-n">1</span><span class="fr-s">/</span><span class="fr-d">2</span></span></span>');
  assert.equal(half.replace(/<[^>]+>/g, ''), '-1/2');
  assert.equal(fracHTML(new Frac(-1n), { paren: true }), '(<span class="q">-1</span>)');
  const mtx = matrixHTML([[Frac.of(1), Frac.of(2)], [Frac.of(3), Frac.of(4)]], { bar: 1, highlight: [1], det: true });
  assert.match(mtx, /^<span class="mtx det">/);
  assert.equal((mtx.match(/<tr/g) || []).length, 2);
  assert.equal((mtx.match(/class="aug"/g) || []).length, 2);
  assert.equal((mtx.match(/<tr class="hl">/g) || []).length, 1);
  assert.match(matrixHTML([['<b>']], { raw: true, label: 'A "x"' }), /aria-label="A &quot;x&quot;"/);
  const poly = polyHTML([Frac.of(6), Frac.of(-11), Frac.of(6), Frac.of(-1)]);
  assert.equal(poly.replace(/<[^>]+>/g, ''), '-λ3 + 6λ2 - 11λ + 6');
  const surd = surdHTML(solveQuadratic(1, -5, -2));
  assert.equal(surd.replace(/<[^>]+>/g, ''), '(5 ± √33)/2');
  assert.equal(surdHTML(solveQuadratic(1, 0, 1)).replace(/<[^>]+>/g, ''), '±i');
  assert.equal(surdHTML(solveQuadratic(1, -2, 5)).replace(/<[^>]+>/g, ''), '1 ± 2i');
  assert.equal(surdHTML(solveQuadratic(1, 0, -8)).replace(/<[^>]+>/g, ''), '±2√2');
});

test('aproximações decimais: algarismos significativos e potência de 10', () => {
  assert.equal(decimalText(5.372281323269), '5,372281');
  assert.equal(decimalText(-0), '0');
  assert.equal(decimalText(1 / 6048000), '1,6534 · 10<sup>-7</sup>');
  assert.equal(decimalText(2.5e20), '2,5000 · 10<sup>20</sup>');
});
