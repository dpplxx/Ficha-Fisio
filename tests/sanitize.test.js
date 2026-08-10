import { describe, it, expect } from 'vitest';
import { esc, escAttr, escTxt } from '../app/lib/sanitize.js';

describe('sanitize.esc — guarda de regressão do XSS armazenado em renderSessoes/renderImagens', () => {
  it('mantém texto normal sem alterar', () => {
    expect(esc('dor no joelho direito')).toBe('dor no joelho direito');
  });

  it('neutraliza uma tag <script>', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('neutraliza o payload real usado pra explorar o bug (img onerror)', () => {
    const payload = '<img src=x onerror=alert(document.cookie)>';
    const out = esc(payload);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('escapa aspas duplas e simples — impede fuga de atributo HTML (ex.: value="...")', () => {
    expect(esc('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)');
    expect(esc("' onmouseover='alert(1)")).toBe('&#39; onmouseover=&#39;alert(1)');
  });

  it('trata null/undefined como string vazia, sem lançar erro', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('escAttr e escTxt são a mesma implementação — não existem mais 3 versões divergentes', () => {
    expect(escAttr).toBe(esc);
    expect(escTxt).toBe(esc);
  });
});
