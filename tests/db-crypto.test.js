import { describe, it, expect } from 'vitest';
import { encryptString, decryptString, ehCifrado } from '../app/lib/db-crypto.js';

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
