/* Cifra/decifra o texto salvo em localStorage sob DB_KEY (o banco de dados
   inteiro do fisioterapeuta: pacientes, agenda, financeiro). A chave em si NUNCA
   é gerada aqui — vem da Edge Function `licenca`, que só entrega quando há
   assinatura ativa ou trial (controlado no servidor) ainda válido. Sem essa
   chave, o texto salvo no navegador é ilegível — é isso que torna o bloqueio de
   acesso mais que só uma classe CSS escondendo a tela. */
(function (global) {
  const PREFIXO = 'ENC1:';

  function b64urlEncode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function importKey(keyB64url) {
    return crypto.subtle.importKey('raw', b64urlDecode(keyB64url), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  function ehCifrado(texto) {
    return typeof texto === 'string' && texto.indexOf(PREFIXO) === 0;
  }
  async function encryptString(plain, keyB64url) {
    const key = await importKey(keyB64url);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(plain);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const combined = new Uint8Array(iv.length + cipher.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipher), iv.length);
    return PREFIXO + b64urlEncode(combined);
  }
  async function decryptString(blob, keyB64url) {
    if (!ehCifrado(blob)) throw new Error('não é um blob cifrado');
    const bytes = b64urlDecode(blob.slice(PREFIXO.length));
    const iv = bytes.slice(0, 12), cipher = bytes.slice(12);
    const key = await importKey(keyB64url);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
  }

  /* Abre um blob cifrado tentando a chave atual primeiro; se falhar (ex.: o blob
     foi cifrado com uma chave antiga, de um esquema já descontinuado) e uma
     chaveAntiga foi passada, tenta com ela. Não decide nada sobre persistência —
     só diz se abriu, com qual texto, e se a chave usada foi a antiga (pra quem
     chamar saber que precisa recifrar com a chave atual). Nunca lança exceção:
     falha em ambas as chaves só significa "não abriu". */
  async function abrirComMigracao(blobCifrado, chaveAtual, chaveAntiga) {
    try {
      const texto = await decryptString(blobCifrado, chaveAtual);
      return { ok: true, texto, migrou: false };
    } catch (e) {
      if (!chaveAntiga) return { ok: false };
      try {
        const texto = await decryptString(blobCifrado, chaveAntiga);
        return { ok: true, texto, migrou: true };
      } catch (e2) {
        return { ok: false };
      }
    }
  }

  const api = { encryptString, decryptString, ehCifrado, abrirComMigracao };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.DbCrypto = api;
})(typeof window !== 'undefined' ? window : globalThis);
