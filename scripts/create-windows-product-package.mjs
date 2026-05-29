import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cp as copy, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');
const packageName = 'second-brain-product-windows';
const stageDir = path.join(releaseDir, packageName);
const zipPath = path.join(releaseDir, `${packageName}.zip`);
const allowMissingRuntime = process.argv.includes('--allow-missing-runtime');
const skipBuild = process.argv.includes('--skip-build');

main().catch((error) => {
  console.error(`[package] ${error.message}`);
  process.exit(1);
});

async function main() {
  if (!skipBuild) run('npm', ['run', 'build'], { cwd: rootDir });

  const missing = validateInputs();
  if (missing.length && !allowMissingRuntime) {
    throw new Error([
      'Cannot create an offline Windows product package yet. Missing bundled runtime files:',
      ...missing.map((item) => `  - ${item}`),
      '',
      'Add the missing files under runtime/, or rerun with --allow-missing-runtime to create a developer preview package.'
    ].join('\n'));
  }

  if (missing.length) {
    console.warn('[package] Creating developer preview package with missing runtime files:');
    for (const item of missing) console.warn(`  - ${item}`);
  }

  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  await copyApp();
  await copyRuntime();
  await copyConfig();
  await copyWindowsLaunchers();
  normalizeWindowsLauncherLineEndings();
  await copyDocs();
  writeManifest(missing);
  createZip();

  console.log(`[package] staged: ${stageDir}`);
  console.log(`[package] zip:    ${zipPath}`);
}

function validateInputs() {
  const missing = [];
  if (!existsSync(path.join(rootDir, 'dist', 'index.html'))) missing.push('dist/index.html');
  if (!findNodeRuntime()) missing.push('runtime/node/.../node.exe');
  if (!findHermesRuntime()) missing.push('runtime/hermes/bin/hermes.exe or runtime/hermes/bin/hermes.cmd');
  return missing;
}

async function copyApp() {
  const appDir = path.join(stageDir, 'app');
  mkdirSync(appDir, { recursive: true });
  await copy(path.join(rootDir, 'dist'), path.join(appDir, 'dist'), { recursive: true, filter: copyFilter });
  await copy(path.join(rootDir, 'server'), path.join(appDir, 'server'), { recursive: true, filter: copyFilter });
  await copy(path.join(rootDir, 'scripts', 'start-product.mjs'), path.join(appDir, 'scripts', 'start-product.mjs'), { recursive: true, filter: copyFilter });
  await copy(path.join(rootDir, 'package.json'), path.join(appDir, 'package.json'), { filter: copyFilter });
}

async function copyRuntime() {
  mkdirSync(path.join(stageDir, 'runtime'), { recursive: true });
  if (!existsSync(path.join(rootDir, 'runtime'))) return;
  await copy(path.join(rootDir, 'runtime'), path.join(stageDir, 'runtime'), { recursive: true, filter: copyFilter });
}

async function copyConfig() {
  const configDir = path.join(stageDir, 'config');
  mkdirSync(configDir, { recursive: true });
  const examplePath = path.join(rootDir, 'config', 'product.env.example');
  const example = existsSync(examplePath) ? await readFile(examplePath, 'utf8') : '';
  const productEnv = [
    '# Product-private runtime configuration.',
    '# API_SERVER_KEY is generated on first launch if omitted.',
    '',
    'SECOND_BRAIN_PRODUCT_MODE=1',
    'SECOND_BRAIN_EMBEDDED_HERMES=1',
    'SECOND_BRAIN_HERMES_PORT=18643',
    'HERMES_API_TARGET=http://127.0.0.1:18643',
    '',
    '# Cloud model credentials should be written into the bundled Hermes config.',
    '# This app package does not use the user global ~/.hermes directory.',
    ''
  ].join('\n');
  writeFileSync(path.join(configDir, 'product.env'), productEnv);
  if (example) writeFileSync(path.join(configDir, 'product.env.example'), example);
}

async function copyWindowsLaunchers() {
  await copy(path.join(rootDir, 'packaging', 'windows'), stageDir, { recursive: true, filter: copyFilter });
}

function normalizeWindowsLauncherLineEndings() {
  for (const fileName of [
    'Start-SecondBrain.cmd',
    'Stop-SecondBrain.cmd',
    'Run-SecondBrain-Server.cmd',
    'Set-SecondBrain-Env.cmd',
    'Wait-SecondBrain.ps1'
  ]) {
    const filePath = path.join(stageDir, fileName);
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, 'utf8');
    writeFileSync(filePath, `${text.replace(/\r?\n/g, '\r\n').replace(/\r\n*$/, '')}\r\n`);
  }
}

async function copyDocs() {
  for (const fileName of ['README.md', 'PRODUCT_MODE.md', 'WINDOWS_INSTALL.md']) {
    const source = path.join(rootDir, fileName);
    if (existsSync(source)) await copy(source, path.join(stageDir, 'docs', fileName), { filter: copyFilter });
  }
}

function writeManifest(missing) {
  const manifest = {
    name: 'Second Brain',
    package: packageName,
    createdAt: new Date().toISOString(),
    productMode: true,
    offlineInstaller: missing.length === 0,
    missingRuntimeFiles: missing,
    entrypoints: {
      start: 'Start-SecondBrain.cmd',
      stop: 'Stop-SecondBrain.cmd'
    },
    runtime: {
      node: findNodeRuntime()?.replace(rootDir + path.sep, '') || null,
      hermes: findHermesRuntime()?.replace(rootDir + path.sep, '') || null,
      wiki: 'runtime/llm-wiki'
    }
  };
  writeFileSync(path.join(stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function createZip() {
  rmSync(zipPath, { force: true });
  const zip = spawnSync('zip', ['-r', zipPath, packageName], {
    cwd: releaseDir,
    stdio: 'inherit'
  });
  if (zip.status !== 0) {
    console.warn('[package] zip command failed or is unavailable; staged directory was still created.');
  }
}

function findNodeRuntime() {
  return findExisting([
    path.join(rootDir, 'runtime', 'node', 'node.exe'),
    path.join(rootDir, 'runtime', 'node', 'win-x64', 'node.exe'),
    path.join(rootDir, 'runtime', 'node', 'windows-x64', 'node.exe'),
    ...globDirs(path.join(rootDir, 'runtime', 'node'), /^node-v/).map((dir) => path.join(dir, 'node.exe'))
  ]);
}

function findHermesRuntime() {
  return findExisting([
    path.join(rootDir, 'runtime', 'hermes', 'bin', 'hermes.exe'),
    path.join(rootDir, 'runtime', 'hermes', 'bin', 'hermes.cmd'),
    path.join(rootDir, 'runtime', 'hermes', 'bin', 'hermes.bat'),
    path.join(rootDir, 'runtime', 'hermes', 'hermes.exe'),
    path.join(rootDir, 'runtime', 'hermes', 'hermes.cmd'),
    path.join(rootDir, 'runtime', 'hermes', 'hermes.bat'),
    path.join(rootDir, 'runtime', 'hermes', 'hermes', 'bin', 'hermes.exe'),
    path.join(rootDir, 'runtime', 'hermes', 'hermes', 'bin', 'hermes.cmd'),
    path.join(rootDir, 'runtime', 'hermes', 'hermes', 'bin', 'hermes.bat'),
    path.join(rootDir, 'runtime', 'hermes', 'hermes', 'hermes.exe'),
    path.join(rootDir, 'runtime', 'hermes', 'hermes', 'hermes.cmd'),
    path.join(rootDir, 'runtime', 'hermes', 'hermes', 'hermes.bat')
  ]);
}

function findExisting(candidates) {
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function globDirs(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => path.join(dir, entry.name));
}

function copyFilter(source) {
  const name = path.basename(source);
  if (name === '.DS_Store') return false;
  if (name === 'node_modules') return false;
  if (name === '.git') return false;
  return true;
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(' ')}`);
}
