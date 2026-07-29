const { execSync } = require('child_process');
const realNode = 'C:\\nvm4w\\nodejs\\node.exe';
const tscPath = 'D:\\二次开发\\desktop\\node_modules\\typescript\\bin\\tsc';
const cwd = 'D:\\二次开发\\desktop';
console.log('=== Desktop tsc web ===');
try {
  execSync(`"${realNode}" "${tscPath}" --noEmit -p tsconfig.web.json`, {
    cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 30 * 1024 * 1024,
  });
  console.log('DESKTOP_WEB_SUCCESS');
} catch (e) {
  console.log('STDOUT:', (e.stdout || '').substring(0, 20000));
  console.log('STDERR:', (e.stderr || '').substring(0, 20000));
  console.log('DESKTOP_WEB_FAILED:', e.status);
}
console.log('=== Desktop tsc node ===');
try {
  execSync(`"${realNode}" "${tscPath}" --noEmit -p tsconfig.node.json`, {
    cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 30 * 1024 * 1024,
  });
  console.log('DESKTOP_NODE_SUCCESS');
} catch (e) {
  console.log('STDOUT:', (e.stdout || '').substring(0, 20000));
  console.log('STDERR:', (e.stderr || '').substring(0, 20000));
  console.log('DESKTOP_NODE_FAILED:', e.status);
}
