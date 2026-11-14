const EXT = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
  video: ['mp4', 'webm', '3gp'],
  audio: ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac', 'opus'],
  text: ['txt', 'md', 'json', 'csv', 'log', 'xml', 'js', 'css', 'ini', 'yml', 'yaml'],
};

const LABEL = {
  html: 'Website HTML', zip: 'Website ZIP', pdf: 'PDF',
  image: 'Gambar', video: 'Video', audio: 'Audio', text: 'Teks',
};

function classify(fileName) {
  const ext = (String(fileName).split('.').pop() || '').toLowerCase();
  if (ext === 'html' || ext === 'htm') return { kind: 'site', type: 'html', ext };
  if (ext === 'zip') return { kind: 'site', type: 'zip', ext };
  if (ext === 'pdf') return { kind: 'pdf', type: 'pdf', ext };
  for (const t of Object.keys(EXT)) if (EXT[t].includes(ext)) return { kind: 'viewer', type: t, ext };
  return null;
}

const safeName = (fileName) => 'content.' + ((String(fileName).split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function makeViewerHtml(type, title, file, text) {
  const head =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${esc(title)}</title><style>` +
    'html,body{margin:0;height:100%;background:#000;color:#eee;font-family:system-ui,sans-serif}' +
    '.c{display:flex;align-items:center;justify-content:center;min-height:100%;text-align:center}' +
    'img{max-width:100%;max-height:100vh;object-fit:contain}' +
    'video{width:100%;height:100%;background:#000}' +
    'pre{white-space:pre-wrap;word-break:break-word;padding:14px;margin:0;font:14px/1.5 monospace;background:#0d1117;color:#e6edf3;min-height:100%;box-sizing:border-box}' +
    '</style></head><body>';
  let body = '';
  if (type === 'image') body = `<div class="c"><img src="${file}" alt=""></div>`;
  else if (type === 'video') body = `<video src="${file}" controls autoplay playsinline></video>`;
  else if (type === 'audio') body = `<div class="c"><div><h3>${esc(title)}</h3><audio src="${file}" controls style="width:90vw"></audio></div></div>`;
  else body = `<pre>${esc(text || '')}</pre>`;
  return head + body + '</body></html>';
}

const SUPPORTED_TEXT =
  '• Website: .html atau .zip (berisi index.html)\n' +
  '• PDF: .pdf\n' +
  '• Gambar: png, jpg, gif, webp, svg\n' +
  '• Video: mp4, webm\n' +
  '• Audio: mp3, ogg, wav, m4a\n' +
  '• Teks: txt, md, json, csv, log';

module.exports = { classify, safeName, makeViewerHtml, SUPPORTED_TEXT, LABEL };
