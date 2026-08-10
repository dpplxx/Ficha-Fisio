import { describe, it, expect } from 'vitest';
import { encryptString, decryptString, ehCifrado, abrirComMigracao } from '../app/lib/db-crypto.js';

// AES-GCM exige chave de 16/24/32 bytes — gera uma chave de 32 bytes válida em base64url,
// igual ao formato que a Edge Function `licenca` devolve de verdade.
function chaveTeste() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const CHAVE = chaveTeste();

describe('DbCrypto — protege o que fica salvo em localStorage sob DB_KEY', () => {
  it('cifra e decifra de volta pro texto original', async () => {
    const original = JSON.stringify({ pacientes: [{ id: 1, nome: 'Paciente Teste' }] });
    const blob = await encryptString(original, CHAVE);
    expect(ehCifrado(blob)).toBe(true);
    const decifrado = await decryptString(blob, CHAVE);
    expect(decifrado).toBe(original);
  });

  it('o blob cifrado não contém o texto original em claro', async () => {
    const original = 'dado sensível de paciente, não deveria aparecer cru no localStorage';
    const blob = await encryptString(original, CHAVE);
    expect(blob).not.toContain(original);
  });

  it('ehCifrado identifica texto legado (JSON puro) como não-cifrado', () => {
    expect(ehCifrado('{"pacientes":[]}')).toBe(false);
    expect(ehCifrado('')).toBe(false);
    expect(ehCifrado(null)).toBe(false);
  });

  it('decifrar com a chave errada falha (não retorna lixo silenciosamente)', async () => {
    const blob = await encryptString('segredo', CHAVE);
    const outraChave = chaveTeste();
    await expect(decryptString(blob, outraChave)).rejects.toThrow();
  });
});

// Regressão do bug de rotação mensal: DB cifrado em agosto com a chave de agosto
// (esquema antigo, descontinuado) precisa continuar abrindo depois que o mês vira
// e o servidor passa a mandar uma chave nova — sem perder o cliente pagante fora
// do próprio prontuário. Ver CHANGELOG e supabase-functions/licenca/index.ts.
describe('abrirComMigracao — cliente não perde acesso quando a chave muda de mês', () => {
  it('abre direto com a chave atual quando o DB já foi cifrado com ela (caso normal)', async () => {
    const chaveAtual = chaveTeste();
    const original = JSON.stringify({ pacientes: [{ id: 1, nome: 'Paciente Set' }] });
    const blob = await encryptString(original, chaveAtual);

    const r = await abrirComMigracao(blob, chaveAtual, chaveTeste());
    expect(r.ok).toBe(true);
    expect(r.migrou).toBe(false);
    expect(r.texto).toBe(original);
  });

  it('DB cifrado em agosto (chave antiga) abre em setembro (chave nova) via migração', async () => {
    const chaveAgosto = chaveTeste(); // simula a chave derivada com epoch "2026-08"
    const chaveSetembro = chaveTeste(); // simula a chave derivada com epoch "2026-09"
    const original = JSON.stringify({ pacientes: [{ id: 1, nome: 'Paciente Ago' }], agenda: [], financeiro: [] });
    const blobDeAgosto = await encryptString(original, chaveAgosto);

    // "chegada de setembro": licenca devolve a chave nova como atual e a de
    // agosto como chaveAntiga (ponte) — o app tenta a nova primeiro, cai pra antiga
    const r = await abrirComMigracao(blobDeAgosto, chaveSetembro, chaveAgosto);
    expect(r.ok).toBe(true);
    expect(r.migrou).toBe(true);
    expect(r.texto).toBe(original); // integridade: o conteúdo é exatamente o mesmo

    // depois de migrar, recifra com a chave nova — e essa recifragem tem que
    // ficar diretamente abrível pela chave nova, sem precisar da antiga de novo
    const blobRecifrado = await encryptString(r.texto, chaveSetembro);
    const r2 = await abrirComMigracao(blobRecifrado, chaveSetembro, chaveAgosto);
    expect(r2.ok).toBe(true);
    expect(r2.migrou).toBe(false); // já não precisa mais da chave antiga
    expect(r2.texto).toBe(original);
  });

  it('chave nova errada E chave antiga ausente → não abre (sem exceção não tratada)', async () => {
    const chaveAgosto = chaveTeste();
    const blob = await encryptString('dado real', chaveAgosto);
    const r = await abrirComMigracao(blob, chaveTeste(), undefined);
    expect(r.ok).toBe(false);
    expect(r.texto).toBeUndefined();
  });

  it('nem a chave nova nem a antiga abrem (licença de outro usuário/conta) → não abre', async () => {
    const chaveDoDono = chaveTeste();
    const blob = await encryptString('dado do dono', chaveDoDono);
    const chaveDeOutroUsuario = chaveTeste();
    const chaveAntigaDeOutroUsuario = chaveTeste();
    const r = await abrirComMigracao(blob, chaveDeOutroUsuario, chaveAntigaDeOutroUsuario);
    expect(r.ok).toBe(false);
  });

  it('ciphertext adulterado não abre mesmo com a chave certa (tag de autenticação do AES-GCM)', async () => {
    const chaveAtual = chaveTeste();
    const blob = await encryptString('dado íntegro', chaveAtual);
    // troca um caractere do meio do blob cifrado, simulando adulteração
    const meio = Math.floor(blob.length / 2);
    const charTrocado = blob[meio] === 'A' ? 'B' : 'A';
    const blobAdulterado = blob.slice(0, meio) + charTrocado + blob.slice(meio + 1);
    const r = await abrirComMigracao(blobAdulterado, chaveAtual, chaveTeste());
    expect(r.ok).toBe(false);
  });

  it('sem licença nenhuma (nenhuma chave disponível) não é chamado — mas se for, não abre nada', async () => {
    // representa o caso em que tentarDesbloquear nem deveria ter chegado a chamar
    // isso (sem chave nova e sem cache, ver V3) — aqui só garante que, mesmo que
    // chame com chaves vazias/inválidas, o resultado é sempre "não abriu".
    const chaveAgosto = chaveTeste();
    const blob = await encryptString('dado protegido', chaveAgosto);
    const r = await abrirComMigracao(blob, '', null);
    expect(r.ok).toBe(false);
  });
});
