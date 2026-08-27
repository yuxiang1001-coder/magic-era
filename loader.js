(async () => {
  'use strict';
  const status = document.getElementById('toast');
  const fail = (msg) => { if (status) { status.textContent = msg; status.classList.add('show'); } console.error(msg); };
  async function loadFiles(files) {
    const texts = await Promise.all(files.map(file =>
      fetch(`assets/${file}`, {cache:'no-cache'}).then(r => {
        if (!r.ok) throw new Error(`${file} HTTP ${r.status}`);
        return r.text();
      })
    ));
    const b64 = texts.join('').replace(/\s+/g, '');
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i=0;i<raw.length;i++) bytes[i] = raw.charCodeAt(i);
    if (!('DecompressionStream' in window)) throw new Error('当前浏览器不支持 DecompressionStream，请升级到较新的 Chrome / Firefox / Safari。');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  try {
    const dataCode = await loadFiles(['data.00.b64','data.01.b64']);
    (0, eval)(dataCode);
    const gameCode = await loadFiles([
      'game.v26x.00.b64','game.v26x.01.b64','game.v26x.02.b64','game.v26x.03.b64',
      'game.v26x.04.b64','game.v26x.05.b64','game.v26x.06.b64'
    ]);
    (0, eval)(gameCode);
  } catch (err) {
    fail(`魔法纪元加载失败：${err.message || err}`);
  }
})();
