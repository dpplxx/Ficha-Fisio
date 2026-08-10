import { describe, it, expect } from 'vitest';
import { diasRestantesTrial } from '../app/lib/trial.js';

const DIA = 86400000;

describe('TrialMath.diasRestantesTrial', () => {
  it('recém-iniciado: retorna o total de dias do trial', () => {
    expect(diasRestantesTrial(1000, 1000, 5)).toBe(5);
  });

  it('no meio do trial: retorna os dias restantes arredondados pra cima', () => {
    // passaram pouco mais de 2 dias de um trial de 5
    expect(diasRestantesTrial(0, 2 * DIA + 1, 5)).toBe(3);
  });

  it('exatamente no fim do trial: retorna 0, nunca negativo', () => {
    expect(diasRestantesTrial(0, 5 * DIA, 5)).toBe(0);
  });

  it('trial expirado há muito tempo: continua em 0', () => {
    expect(diasRestantesTrial(0, 30 * DIA, 5)).toBe(0);
  });

  it('relógio do aparelho manipulado/atrasado pra trás: não devolve mais dias que o trial configurado', () => {
    // sem o teto superior, "agora" antes do início inflava o resultado além de trialDias
    expect(diasRestantesTrial(10 * DIA, 0, 5)).toBe(5);
  });
});
