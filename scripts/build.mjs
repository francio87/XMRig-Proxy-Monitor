import { cp, mkdir, rm } from 'node:fs/promises';

const outputDirectory = 'public';

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  cp('frontend/index.html', `${outputDirectory}/index.html`),
  cp('frontend/js', `${outputDirectory}/js`, { recursive: true }),
  cp('frontend/vendor', `${outputDirectory}/vendor`, { recursive: true }),
]);

