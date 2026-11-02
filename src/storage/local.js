import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Parse a single-range `Range: bytes=a-b` header. Returns null (no/invalid range) or {start,end} or 'unsatisfiable'. */
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    const n = Number(m[2]);
    start = Math.max(size - n, 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

/** Storage driver that streams files from a directory, with HTTP Range support. */
export function createLocalStorage(dir) {
  const root = path.resolve(dir);
  return {
    driver: 'local',
    async serve(req, res, key) {
      const file = path.resolve(root, key);
      if (file !== root && !file.startsWith(root + path.sep)) return res.status(400).end();
      let stat;
      try {
        stat = await fs.promises.stat(file);
        if (!stat.isFile()) throw new Error('not a file');
      } catch {
        return res.status(404).end();
      }
      res.set('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
      res.set('Accept-Ranges', 'bytes');
      const range = parseRange(req.headers.range, stat.size);
      if (range === 'unsatisfiable') {
        res.set('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }
      if (range) {
        res.status(206);
        res.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
        res.set('Content-Length', String(range.end - range.start + 1));
        return fs.createReadStream(file, range).pipe(res);
      }
      res.set('Content-Length', String(stat.size));
      return fs.createReadStream(file).pipe(res);
    },
  };
}
