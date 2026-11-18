// Local-only review: /review/ shows the captured screenshots; / runs the printer-free demo.
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const output = path.resolve('../_reviews/voyager-seven-prs');
const gallery = (req, res, next) => {
  if (!req.url?.startsWith('/review/')) return next();
  const name = decodeURIComponent(req.url.split('?')[0].slice('/review/'.length)) || 'index.html';
  if (path.basename(name) !== name) {
    res.statusCode = 400;
    return res.end();
  }
  const file = path.join(output, name);
  if (!fs.existsSync(file)) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8');
  fs.createReadStream(file).pipe(res);
};
const server = await createServer({
  mode: 'demo',
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
  plugins: [
    {
      name: 'local-review-gallery',
      configureServer(s) {
        s.middlewares.use(gallery);
      },
    },
  ],
});
await server.listen();
console.log('Local demo: http://127.0.0.1:5198/ — Screenshots: http://127.0.0.1:5198/review/');
