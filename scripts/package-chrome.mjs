import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const releaseDir = path.join(root, 'dist', `chrome-${manifest.version}`);
const archive = path.join(root, 'dist', `brevityprompt-${manifest.version}-chrome.zip`);

await rm(releaseDir, { recursive: true, force: true });
await rm(archive, { force: true });
await mkdir(releaseDir, { recursive: true });

for (const entry of ['manifest.json', 'src', 'icons', 'wasm']) {
  await cp(path.join(root, entry), path.join(releaseDir, entry), { recursive: true });
}

const packagedManifest = JSON.parse(await readFile(path.join(releaseDir, 'manifest.json'), 'utf8'));
if (packagedManifest.manifest_version !== 3 || !packagedManifest.version) {
  throw new Error('Invalid Chrome MV3 manifest.');
}

const powershell = 'Compress-Archive';
execFileSync('powershell.exe', [
  '-NoProfile', '-Command',
  `${powershell} -Path '${releaseDir.replace(/'/g, "''")}\\*' -DestinationPath '${archive.replace(/'/g, "''")}' -Force`
], { stdio: 'inherit' });

const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(path.join(root, 'dist', 'CHECKSUMS.txt'), `${hash}  ${path.basename(archive)}\n`);
console.log(`Created ${path.relative(root, archive)}`);
