import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const html = read('index.html');
const appSource = read('assets/js/app.js');
const dataSource = read('assets/js/data.js');

try {
  new vm.Script(appSource, { filename: 'assets/js/app.js' });
  new vm.Script(dataSource, { filename: 'assets/js/data.js' });
} catch (error) {
  failures.push(error.message);
}

check(!/<style\b/i.test(html), 'index.html should not contain inline style blocks.');
check(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'index.html should not contain inline executable scripts.');
check(Buffer.byteLength(html) < 20_000, 'index.html should remain below 20 KB.');
check(/<link\s+rel="canonical"/i.test(html), 'A canonical URL is required.');
check(/<meta\s+name="robots"\s+content="noindex/i.test(html), 'The internal site must retain its noindex policy.');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
check(duplicateIds.length === 0, `Duplicate static IDs: ${[...new Set(duplicateIds)].join(', ')}`);

const staticReferences = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
  .map(match => match[1].split('?')[0])
  .filter(value => value && !/^(?:https?:|mailto:|data:)/i.test(value) && !value.includes('${'));
for (const reference of new Set(staticReferences)) {
  check(fs.existsSync(path.join(root, reference)), `Missing local asset: ${reference}`);
}

try {
  const manifest = JSON.parse(read('site.webmanifest'));
  check(Boolean(manifest.name && manifest.short_name && manifest.start_url), 'Manifest is missing required app metadata.');
  for (const icon of manifest.icons || []) {
    check(fs.existsSync(path.join(root, icon.src)), `Missing manifest icon: ${icon.src}`);
  }
} catch (error) {
  failures.push(`Invalid site.webmanifest: ${error.message}`);
}

check(fs.existsSync(path.join(root, 'robots.txt')), 'robots.txt is required.');
check(/Disallow:\s*\//i.test(read('robots.txt')), 'robots.txt must match the internal noindex policy.');

if (failures.length) {
  console.error(`Validation failed (${failures.length}):`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

const mode = process.argv.includes('--build') ? 'Static build validation' : 'Validation';
console.log(`${mode} passed: JavaScript, HTML structure, metadata, manifest, and local assets.`);
