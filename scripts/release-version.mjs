#!/usr/bin/env node
// Keeps @vivexy/ui, @vivexy/core and vivexy-agents-core on one version.
//   node scripts/release-version.mjs 0.2.0          bump manifests and lockfiles
//   node scripts/release-version.mjs --check 0.2.0  fail unless all match (CI)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmManifests = ['packages/ui/package.json', 'packages/core/package.json'];
const dependentManifests = [
  'packages/core/package.json',
  'apps/frontend/package.json',
];
const pyproject = 'packages/agents-core/pyproject.toml';
const pyVersionPattern = /^version = "([^"]+)"/m;

const readJson = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
const writeJson = (file, data) =>
  writeFileSync(join(root, file), `${JSON.stringify(data, null, 2)}\n`);

const currentVersions = () => ({
  ...Object.fromEntries(
    npmManifests.map((file) => [file, readJson(file).version])
  ),
  [pyproject]: readFileSync(join(root, pyproject), 'utf8').match(
    pyVersionPattern
  )[1],
});

const check = (version) => {
  const mismatched = Object.entries(currentVersions()).filter(
    ([, v]) => v !== version
  );
  if (mismatched.length) {
    mismatched.forEach(([file, v]) =>
      console.error(`${file} is ${v}, expected ${version}`)
    );
    process.exit(1);
  }
  console.log(`All packages are at ${version}`);
};

const bump = (version) => {
  npmManifests.forEach((file) =>
    writeJson(file, { ...readJson(file), version })
  );
  dependentManifests.forEach((file) => {
    const manifest = readJson(file);
    ['@vivexy/ui', '@vivexy/core'].forEach((name) => {
      if (manifest.dependencies?.[name]) manifest.dependencies[name] = version;
    });
    writeJson(file, manifest);
  });
  const pyprojectPath = join(root, pyproject);
  writeFileSync(
    pyprojectPath,
    readFileSync(pyprojectPath, 'utf8').replace(
      pyVersionPattern,
      `version = "${version}"`
    )
  );
  execSync('npm install --package-lock-only --ignore-scripts', {
    cwd: root,
    stdio: 'inherit',
  });
  execSync('uv lock', { cwd: root, stdio: 'inherit' });
  console.log(
    `\nBumped to ${version}. Commit, then: git tag v${version} && git push --tags`
  );
};

const args = process.argv.slice(2);
const isCheck = args.includes('--check');
const version = args.find((arg) => !arg.startsWith('--'))?.replace(/^v/, '');

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('Usage: node scripts/release-version.mjs [--check] <semver>');
  process.exit(1);
}

isCheck ? check(version) : bump(version);
