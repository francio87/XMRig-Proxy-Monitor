import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const outputDirectory = 'public';
const developmentFixtures = process.argv.includes('--dev-fixtures');

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  cp('frontend/js', `${outputDirectory}/js`, { recursive: true }),
  cp('frontend/vendor', `${outputDirectory}/vendor`, { recursive: true }),
  ...(developmentFixtures ? [cp('frontend/dev', `${outputDirectory}/dev`, { recursive: true })] : []),
]);

let index = await readFile('frontend/index.html', 'utf8');
if (developmentFixtures) index = index.replace('<script type="module" src="/js/app.js"></script>', '<script src="/dev/fixture-mode.js"></script>\n  <script type="module" src="/js/app.js"></script>');
await writeFile(`${outputDirectory}/index.html`, index);

