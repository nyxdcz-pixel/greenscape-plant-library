import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const bytes = relativePath => fs.statSync(path.join(root, relativePath)).size;
const listFiles = directory => fs.readdirSync(path.join(root, directory))
  .filter(name => fs.statSync(path.join(root, directory, name)).isFile())
  .map(name => `${directory}/${name}`);

const html = read('index.html');
const jsFiles = listFiles('assets/js').filter(file => file.endsWith('.js'));
const cssFiles = listFiles('assets/css').filter(file => file.endsWith('.css'));
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)];
const stylesheets = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi)];
const staticImages = [...html.matchAll(/<img\b[^>]*>/gi)];
const templateImages = jsFiles.flatMap(file => [...read(file).matchAll(/<img\b[^>]*>/gi)].map(match => ({ file, tag: match[0] })));

const report = {
  htmlBytes: bytes('index.html'),
  cssBytes: cssFiles.reduce((total, file) => total + bytes(file), 0),
  jsBytes: jsFiles.reduce((total, file) => total + bytes(file), 0),
  cssFiles: cssFiles.length,
  jsFiles: jsFiles.length,
  stylesheetLinks: stylesheets.length,
  scriptTags: scripts.length,
  deferredScripts: scripts.filter(match => /\bdefer\b/i.test(match[0])).length,
  staticImages: staticImages.length,
  staticImagesMissingDimensions: staticImages.filter(match => !/\bwidth=/.test(match[0]) || !/\bheight=/.test(match[0])).length,
  templateImages: templateImages.length,
  templateImagesMissingLoading: templateImages.filter(item => !/\bloading=/.test(item.tag)).length,
  templateImagesMissingDecoding: templateImages.filter(item => !/\bdecoding=/.test(item.tag)).length
};

console.log('Static quality audit');
console.log('====================');
for (const [key, value] of Object.entries(report)) {
  console.log(`${key}: ${value}`);
}
