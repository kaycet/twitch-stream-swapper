// Verifies every element ID referenced from JS still exists in the markup.
// Redesign safety gate: run via `npm run audit:dom`.
import { readFileSync } from 'node:fs';

const pairs = [
  ['popup.js', 'popup.html'],
  ['options.js', 'options.html'],
];

let failed = false;
for (const [jsFile, htmlFile] of pairs) {
  const js = readFileSync(jsFile, 'utf8');
  const html = readFileSync(htmlFile, 'utf8');
  const ids = new Set(
    [...js.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
      .concat([...js.matchAll(/querySelector(?:All)?\(\s*['"]#([A-Za-z0-9_-]+)['"]/g)].map((m) => m[1])),
  );
  const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
  if (missing.length > 0) {
    console.error(`${htmlFile} missing IDs used by ${jsFile}:`, missing.join(', '));
    failed = true;
  } else {
    console.log(`${htmlFile}: all ${ids.size} JS-referenced IDs present`);
  }
}
process.exit(failed ? 1 : 0);
