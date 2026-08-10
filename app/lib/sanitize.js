/* Escape de HTML — usado em todo innerHTML que insere dado digitado por alguém
   (nome de paciente, notas de evolução, achados de exame, lançamento financeiro etc.),
   pra impedir XSS armazenado.

   Uma única implementação, compartilhada por todos os pontos de renderização.
   Antes existiam 3 versões praticamente iguais (esc/escAttr/escTxt) espalhadas pelo
   arquivo principal, e pelo menos dois pontos de renderização (sessões de evolução,
   exames de imagem) não usavam nenhuma delas — foi ali que o XSS armazenado real
   aconteceu. Os três nomes continuam existindo como alias pra não precisar tocar
   em cada chamada espalhada pelo app; a diferença é que agora só existe um código
   fazendo o escape de verdade. */
(function (global) {
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  const api = { esc: esc, escAttr: esc, escTxt: esc };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node/Vitest
  } else {
    global.esc = esc; global.escAttr = esc; global.escTxt = esc; // navegador
  }
})(typeof window !== 'undefined' ? window : globalThis);
