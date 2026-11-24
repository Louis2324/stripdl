const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const testDirectory = path.resolve(__dirname, '..', 'test');
const testFiles = fs.readdirSync(testDirectory)
  .filter((file) => file.endsWith('.test.cjs') || file.endsWith('.test.mjs'))
  .sort()
  .map((file) => path.join(testDirectory, file));

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
