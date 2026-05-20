const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const ncm = require('NeteaseCloudMusicApi');

const API_HOST = '0.0.0.0';
const API_PORT = parseInt(process.env.API_PORT) || 3001;
const CACHE_PORT = parseInt(process.env.CACHE_PORT) || 3002;
const STATIC_PORT = parseInt(process.env.STATIC_PORT) || 8080;
const CACHE_DIR = path.join(__dirname, 'audio-cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

ncm.server.serveNcmApi({
  port: API_PORT,
  host: '127.0.0.1',
});

function getRemoteClient(remoteUrl) {
  const target = new URL(remoteUrl);
  return target.protocol === 'https:' ? https : http;
}

function requestRemote(remoteUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (!remoteUrl || redirectCount > 5) {
      reject(new Error('remote url invalid'));
      return;
    }

    const client = getRemoteClient(remoteUrl);
    const req = client.request(
      remoteUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://music.163.com/',
          'Origin': 'https://music.163.com',
        },
      },
      (remoteRes) => {
        if ([301, 302, 303, 307, 308].includes(remoteRes.statusCode) && remoteRes.headers.location) {
          remoteRes.resume();
          requestRemote(remoteRes.headers.location, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (remoteRes.statusCode && remoteRes.statusCode >= 400) {
          reject(new Error('remote status ' + remoteRes.statusCode));
          return;
        }

        resolve(remoteRes);
      }
    );

    req.on('error', reject);
    req.end();
  });
}

function pipeLocalFile(filePath, req, res) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('file not found');
      return;
    }

    const total = stat.size;
    const range = req.headers.range;
    const baseHeaders = {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'public, max-age=86400',
    };

    if (!range) {
      res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      res.writeHead(416, baseHeaders);
      res.end();
      return;
    }

    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : total - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start > end || start >= total) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      ...baseHeaders,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${total}`,
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
}

async function ensureAudioCached(id, level, cookie) {
  const cookieSuffix = cookie ? '-' + Buffer.from(cookie).toString('base64').replace(/[\\/+=]/g, '_').slice(0, 24) : '';
  const filePath = path.join(CACHE_DIR, `${id}-${level}${cookieSuffix}.mp3`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  const cookieQuery = cookie ? ('&cookie=' + encodeURIComponent(cookie)) : '';
  const data = await fetch(`http://127.0.0.1:${API_PORT}/song/url/v1?id=${encodeURIComponent(id)}&level=${encodeURIComponent(level)}${cookieQuery}`).then((r) => r.json());
  const remoteUrl = data && data.data && data.data[0] ? data.data[0].url : '';
  if (!remoteUrl) {
    throw new Error('no audio url');
  }

  const remoteRes = await requestRemote(remoteUrl);
  await new Promise((resolve, reject) => {
    const tempPath = `${filePath}.download`;
    const ws = fs.createWriteStream(tempPath);
    remoteRes.pipe(ws);
    remoteRes.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', () => {
      ws.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        fs.rename(tempPath, filePath, (renameErr) => {
          if (renameErr) reject(renameErr);
          else resolve();
        });
      });
    });
  });

  return filePath;
}

const cacheServer = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${API_HOST}:${CACHE_PORT}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers': 'Range, Content-Type');
  res.setHeader('Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (urlObj.pathname !== '/proxy/audio') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const id = urlObj.searchParams.get('id');
  const level = urlObj.searchParams.get('level') || 'exhigh';
  const cookie = urlObj.searchParams.get('cookie') || '';
  if (!id) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('missing id');
    return;
  }

  try {
    const filePath = await ensureAudioCached(id, level, cookie);
    pipeLocalFile(filePath, req, res);
  } catch (e) {
    console.error('[audio-cache]', e.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('audio cache error');
  }
});

cacheServer.listen(CACHE_PORT, API_HOST, () => {
  console.log(`[audio-cache] running @ http://${API_HOST}:${CACHE_PORT}`);
});

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function proxyTo(targetHost, targetPort, req, res) {
  const urlObj = new URL(req.url, `http://${API_HOST}:${STATIC_PORT}`);
  const options = {
    hostname: targetHost,
    port: targetPort,
    path: urlObj.pathname + urlObj.search,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy] error:', err);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Proxy error');
  });

  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  const urlObj = new URL(req.url, `http://${API_HOST}:${STATIC_PORT}`);
  let filePath = path.join(__dirname, urlObj.pathname === '/' ? 'index.html' : urlObj.pathname);

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const mainServer = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${API_HOST}:${STATIC_PORT}`);
  
  if (urlObj.pathname.startsWith('/netease-api')) {
    req.url = urlObj.pathname.replace('/netease-api', '') + urlObj.search;
    proxyTo('127.0.0.1', API_PORT, req, res);
  } else if (urlObj.pathname.startsWith('/audio-cache')) {
    req.url = urlObj.pathname.replace('/audio-cache', '') + urlObj.search;
    proxyTo('127.0.0.1', CACHE_PORT, req, res);
  } else {
    serveStatic(req, res);
  }
});

mainServer.listen(STATIC_PORT, API_HOST, () => {
  console.log(`[main] running @ http://${API_HOST}:${STATIC_PORT}`);
  console.log('');
  console.log('=========================================');
  console.log('  像素风情绪小屋 - 完整版');
  console.log('  访问地址: http://127.0.0.1:' + STATIC_PORT);
  console.log('=========================================');
});
