#!/usr/bin/env node
// Keeps @vivexy/ui, @vivexy/core, @vivexy/desktop, vivexy-agents-core and the
// Helm chart on one version.
//   node scripts/release-version.mjs 0.2.0          bump manifests and lockfiles
//   node scripts/release-version.mjs --check 0.2.0  fail unless all match (CI)
// It also refreshes packages/agents-core/constraints.txt: the exact versions
// vivexy is tested with, which downstream products apply as uv constraints.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmManifests = [
  'packages/ui/package.json',
  'packages/core/package.json',
  'packages/desktop/package.json',
];
const dependentManifests = [
  'packages/core/package.json',
  'apps/frontend/package.json',
];
const pyproject = 'packages/agents-core/pyproject.toml';
const pyVersionPattern = /^version = "([^"]+)"/m;
const constraintsFile = 'packages/agents-core/constraints.txt';
const chartFile = 'infra/k8s/charts/vivexy/Chart.yaml';
const chartVersionPattern = /^version: (.+)$/m;
const chartAppVersionPattern = /^appVersion: .+$/m;
const exportConstraints = () =>
  execSync(
    'uv export --package vivexy-agents-core --frozen --no-dev --no-hashes --no-emit-workspace --no-header --no-annotate',
    { cwd: root, encoding: 'utf8' }
  );

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
  [chartFile]: readFileSync(join(root, chartFile), 'utf8').match(
    chartVersionPattern
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
  if (
    readFileSync(join(root, constraintsFile), 'utf8') !== exportConstraints()
  ) {
    console.error(`${constraintsFile} is stale; run npm run release:version`);
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
  const chartPath = join(root, chartFile);
  writeFileSync(
    chartPath,
    readFileSync(chartPath, 'utf8')
      .replace(chartVersionPattern, `version: ${version}`)
      .replace(chartAppVersionPattern, `appVersion: "${version}"`)
  );
  execSync('npm install --package-lock-only --ignore-scripts', {
    cwd: root,
    stdio: 'inherit',
  });
  execSync('npm install --package-lock-only --ignore-scripts --no-workspaces', {
    cwd: join(root, 'packages/desktop'),
    stdio: 'inherit',
  });
  execSync('uv lock', { cwd: root, stdio: 'inherit' });
  writeFileSync(join(root, constraintsFile), exportConstraints());
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
