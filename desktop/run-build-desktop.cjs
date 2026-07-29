const { execSync } = require('child_process');
const realNode = 'C:\\nvm4w\\nodejs\\node.exe';
const vitePath = 'D:\\二次开发\\desktop\\node_modules\\vite\\bin\\vite.js';
const cwd = 'D:\\二次开发\\desktop';
console.log('Building desktop (electron-vite build)...');
try {
  const out = execSync(`"${realNode}" "${vitePath}" build`, {
    cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0' }
  });
  console.log('OUTPUT:', out.substring(out.length - 4000));
  console.log('BUILD_SUCCESS');
} catch (e) {
  console.log('STDOUT:', (e.stdout || '').substring(0, 20000));
  console.log('STDERR:', (e.stderr || '').substring(0, 20000));
  console.log('CODE:', e.status);
}
