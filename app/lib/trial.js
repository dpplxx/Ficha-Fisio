/* Matemática pura do trial gratuito — separada da leitura/escrita em localStorage
   de propósito, pra dar pra testar sem precisar simular navegador (sem essa
   separação não dava pra escrever um teste de unidade pra essa conta, que é
   exatamente a lógica que decide se o app libera acesso de graça ou não). */
(function (global) {
  function diasRestantesTrial(inicioTs, agoraTs, trialDias) {
    const msRestante = trialDias * 86400000 - (agoraTs - inicioTs);
    // limitado a [0, trialDias]: sem o teto, um relógio do sistema atrasado/manipulado
    // pra trás fazia o cálculo devolver mais dias do que o trial realmente tem.
    return Math.min(trialDias, Math.max(0, Math.ceil(msRestante / 86400000)));
  }
  const api = { diasRestantesTrial: diasRestantesTrial };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node/Vitest
  } else {
    global.TrialMath = api; // navegador
  }
})(typeof window !== 'undefined' ? window : globalThis);
