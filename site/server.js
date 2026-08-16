const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const SITE_DIR = __dirname;

// ---------- MIME types ----------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff2',
  '.woff2': 'font/woff2',
};

// Text-based types that benefit from gzip compression.
const COMPRESSIBLE = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.xml',
  '.txt',
  '.svg',
]);

// ---------- helpers ----------

function getMime(ext) {
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function acceptsGzip(req) {
  return (req.headers['accept-encoding'] || '').includes('gzip');
}

// ---------- request handler ----------

const server = http.createServer((req, res) => {
  // Parse pathname, stripping query string.
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    pathname = '/';
  }

  // Directory traversal protection: reject any path containing "..".
  if (pathname.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Default "/" to "/index.html".
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Build the absolute file path. Strip leading slash so path.join works correctly.
  const relative = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const filePath = path.join(SITE_DIR, relative);

  // Extra safety: ensure resolved path is still inside SITE_DIR.
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(SITE_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check if the file exists. Try appending .html for extensionless URLs (e.g. /launch -> /launch.html).
  // If nothing matches, fall back to index.html (SPA routing).
  let target;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    target = filePath;
  } else if (fs.existsSync(filePath + '.html') && fs.statSync(filePath + '.html').isFile()) {
    target = filePath + '.html';
  } else {
    target = path.join(SITE_DIR, 'index.html');
  }

  const ext = path.extname(target).toLowerCase();
  const contentType = getMime(ext);
  const isHtml = ext === '.html';
  const shouldCompress = COMPRESSIBLE.has(ext) && acceptsGzip(req);

  const headers = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    // HTML: never cache (rapid deploy updates). Everything else: cache 1 day.
    'Cache-Control': isHtml ? 'public, max-age=0, must-revalidate' : 'public, max-age=86400',
  };

  if (shouldCompress) {
    // Read the file into memory, gzip, and send.
    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      zlib.gzip(data, (gzErr, compressed) => {
        if (gzErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
          return;
        }
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
        res.writeHead(200, headers);
        res.end(compressed);
      });
    });
  } else {
    // Stream binary / uncompressed content directly.
    res.writeHead(200, headers);
    fs.createReadStream(target)
      .on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        res.end('Internal Server Error');
      })
      .pipe(res);
  }
});

server.listen(PORT, () => {
  console.log(`MarkuprX site serving on port ${PORT}`);
});
