/* Backup automático em pasta local via File System Access API (Chrome/Edge — não
   existe no Safari/iPhone; nesse caso isSupported() é false e o app cai pro
   lembrete manual de sempre).

   Nenhum dado sai do navegador: é o próprio navegador escrevendo um arquivo no
   disco do usuário, numa pasta que ele mesmo escolheu (ex.: uma pasta já
   sincronizada por OneDrive/Google Drive) — o Ficha Fisio nunca vê nem transmite
   esse arquivo pra lugar nenhum. */
(function (global) {
  const DB_NAME = 'fichaFisioFS';
  const STORE = 'handles';
  const HANDLE_KEY = 'pastaBackup';

  function isSupported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window && 'indexedDB' in window;
  }

  function abrirIDB() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function salvarHandle(handle) {
    const db = await abrirIDB();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }
  async function carregarHandle() {
    const db = await abrirIDB();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(HANDLE_KEY);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function removerHandle() {
    const db = await abrirIDB();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(HANDLE_KEY);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }
  async function escolherPasta() {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await salvarHandle(handle);
    return handle;
  }
  // Só CONSULTA permissão (queryPermission) — nunca pede (requestPermission) fora de
  // um clique do usuário, porque o navegador bloqueia/ignora esse pedido em segundo
  // plano. Pedir de verdade só acontece no fluxo de configurarBackupAutomatico().
  async function temPermissaoSilenciosa(handle) {
    try { return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'; }
    catch (e) { return false; }
  }
  async function pedirPermissao(handle) {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  }
  async function escreverBackup(handle, nomeArquivo, conteudoTexto) {
    const fileHandle = await handle.getFileHandle(nomeArquivo, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(conteudoTexto);
    await writable.close();
  }

  const api = { isSupported, escolherPasta, carregarHandle, removerHandle, temPermissaoSilenciosa, pedirPermissao, escreverBackup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FsBackup = api;
})(typeof window !== 'undefined' ? window : globalThis);
