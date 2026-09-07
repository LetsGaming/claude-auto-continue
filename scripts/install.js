const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const target = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(root, target);

if (!fs.existsSync(vsixPath)) {
  console.error(`Build not found: ${target}`);
  console.error('Run: npm run build');
  process.exit(1);
}

console.log(`Installing ${target}...`);
execSync(`code --install-extension "${vsixPath}"`, {
  cwd: root,
  stdio: 'inherit'
});

console.log('Installed successfully');
