/* Criptografia do payload da pré-anamnese (AES-GCM via Web Crypto).
   Usada tanto no app (gera/guarda a chave, embute no link, decifra a resposta)
   quanto na página pública da pré-anamnese (cifra a resposta do paciente usando
   a chave recebida no fragmento da URL).

   Antes disso o código "FICHA::..." era só Base64 do JSON puro — qualquer pessoa
   com a mensagem do WhatsApp conseguia decodificar e ler dado clínico do paciente.
   Agora o conteúdo vai cifrado; só quem tem a chave (que fica só no localStorage
   do aparelho do fisioterapeuta, nunca em servidor) consegue decifrar.

   Não é E2E "de livro-texto" contra um adversário que já comprometeu o aparelho do
   fisioterapeuta — a chave mora ali. O que isso resolve é o vazamento passivo:
   a mensagem em trânsito/no histórico do WhatsApp deixa de ser texto plano. */
(function (global) {
  const KEY_STORAGE = 'fisio_preanamnese_key';

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
  function getOrCreateKeyB64() {
    let raw = localStorage.getItem(KEY_STORAGE);
    if (!raw) {
      raw = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
      localStorage.setItem(KEY_STORAGE, raw);
    }
    return raw;
  }
  function importKey(keyB64) {
    return crypto.subtle.importKey('raw', b64urlDecode(keyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function encryptJSON(obj, keyB64) {
    const key = await importKey(keyB64);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const combined = new Uint8Array(iv.length + cipher.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipher), iv.length);
    return 'FICHA::v2:' + b64urlEncode(combined);
  }
  async function decryptCode(code, keyB64) {
    const b64 = code.slice(code.indexOf('v2:') + 3);
    const bytes = b64urlDecode(b64);
    const iv = bytes.slice(0, 12), cipher = bytes.slice(12);
    const key = await importKey(keyB64);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  }
  function keyFromLocationHash() {
    const m = location.hash.match(/[#&]k=([^&]+)/);
    return m ? m[1] : null;
  }

  global.PreAnamneseCrypto = { getOrCreateKeyB64, encryptJSON, decryptCode, keyFromLocationHash };
})(window);
