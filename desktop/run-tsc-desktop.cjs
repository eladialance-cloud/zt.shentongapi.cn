const { execSync } = require('child_process');
const realNode = 'C:\\nvm4w\\nodejs\\node.exe';
const tscPath = 'D:\\二次开发\\desktop\\node_modules\\typescript\\bin\\tsc';
const cwd = 'D:\\二次开发\\desktop';
console.log('Running desktop tsc --noEmit (web)...');
try {
  const out1 = execSync(`"${realNode}" "${tscPath}" --noEmit -p tsconfig.web.json`, {
    cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 20 * 1024 * 1024,
  });
  console.log('WEB_OUTPUT:', out1);
  console.log('WEB_SUCCESS');
} catch (e) {
  console.log('WEB_STDOUT:', (e.stdout || '').substring(0, 15000));
  console.log('WEB_STDERR:', (e.stderr || '').substring(0, 15000));
  console.log('WEB_CODE:', e.status);
  process.exit(1);
}
console.log('Running desktop tsc --noEmit (node)...');
try {
  const out2 = execSync(`"${realNode}" "${tscPath}" --noEmit -p tsconfig.node.json`, {
    cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 20 * 1024 * 1024,
  });
  console.log('NODE_OUTPUT:', out2);
  console.log('NODE_SUCCESS');
} catch (e) {
  console.log('NODE_STDOUT:', (e.stdout || '').substring(0, 15000));
  console.log('NODE_STDERR:', (e.stderr || '').substring(0, 15000));
  console.log('NODE_CODE:', e.status);
  process.exit(1);
}
console.log('ALL_TSC_SUCCESS');
