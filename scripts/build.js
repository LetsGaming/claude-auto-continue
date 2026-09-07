const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const target = `${pkg.name}-${pkg.version}.vsix`;
const outDir = root;

for (const entry of fs.readdirSync(outDir)) {
  if (entry.endsWith('.vsix') && entry !== target) {
    const full = path.join(outDir, entry);
    console.log(`Removing old build: ${entry}`);
    fs.rmSync(full, { force: true });
  }
}

console.log(`Building ${target}...`);
execSync(`npx vsce package --out "${path.join(outDir, target)}"`, {
  cwd: root,
  stdio: 'inherit'
});

console.log(`Created ${target}`);
