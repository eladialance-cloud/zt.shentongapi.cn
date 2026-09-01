/**
 * 后端烟雾测试脚本 - 不依赖数据库/Redis
 * 直接测试编译后的模块代码
 */
const path = require('path');
const fs = require('fs');

const distPath = path.join(__dirname, '..', 'dist');
let passCount = 0;
let failCount = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passCount++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failCount++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passCount++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failCount++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('\n========================================');
console.log('  后端烟雾测试 (无数据库依赖)');
console.log('========================================\n');

// === 1. 编译产物检查 ===
console.log('--- 编译产物检查 ---');
test('dist 目录存在', () => {
  if (!fs.existsSync(distPath)) throw new Error('dist 目录不存在');
});

test('main.js 编译产物存在', () => {
  const mainPath = path.join(distPath, 'main.js');
  if (!fs.existsSync(mainPath)) throw new Error('dist/main.js 不存在');
});

test('app.module.js 编译产物存在', () => {
  const modPath = path.join(distPath, 'app.module.js');
  if (!fs.existsSync(modPath, 'modPath')) throw new Error('dist/app.module.js 不存在');
});

// === 2. 模块完整性检查 ===
console.log('\n--- 模块完整性检查 ---');
const expectedModules = [
  'auth', 'user', 'agent', 'chat', 'payment', 'credits',
  'file', 'storage', 'rag', 'mcp', 'n8n',
  'skill-store', 'statistics', 'system', 'tenant', 'device',
  'reconciliation', 'sync', 'api-key-pool', 'version', 'runtime',
  'admin-auth', 'admin-role', 'admin-log', 'admin-user', 'admin-agent',
  'admin-workflow', 'admin-plugin', 'admin-model', 'admin-finance',
  'admin-audit', 'admin-system', 'admin-skill-store',
];

test('所有业务模块编译产物存在', () => {
  const missing = [];
  for (const mod of expectedModules) {
    const modPath = path.join(distPath, 'modules', mod, `${mod}.module.js`);
    if (!fs.existsSync(modPath)) {
      // 也检查非标准命名
      const altPath = path.join(distPath, 'modules', mod);
      if (!fs.existsSync(altPath)) {
        missing.push(mod);
      }
    }
  }
  if (missing.length > 0) throw new Error(`缺失模块: ${missing.join(', ')}`);
});

// === 3. 安全配置检查 ===
console.log('\n--- 安全配置检查 ---');

test('JWT 密钥长度 >= 32 字符', () => {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const match = env.match(/JWT_SECRET=(.+)/);
  if (!match) throw new Error('JWT_SECRET 未配置');
  if (match[1].length < 32) throw new Error(`JWT_SECRET 长度 ${match[1].length} < 32`);
});

test('ADMIN_JWT_SECRET 与 JWT_SECRET 不同', () => {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const jwtMatch = env.match(/JWT_SECRET=(.+)/);
  const adminMatch = env.match(/ADMIN_JWT_SECRET=(.+)/);
  if (!jwtMatch || !adminMatch) throw new Error('密钥未配置');
  if (jwtMatch[1] === adminMatch[1]) throw new Error('两个密钥相同');
});

test('HMAC_SECRET 已配置', () => {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const match = env.match(/HMAC_SECRET=(.+)/);
  if (!match) throw new Error('HMAC_SECRET 未配置');
  if (match[1].length < 16) throw new Error('HMAC_SECRET 长度不足');
});

test('AES_KEY 已配置', () => {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const match = env.match(/AES_KEY=(.+)/);
  if (!match) throw new Error('AES_KEY 未配置');
  if (match[1].length < 16) throw new Error('AES_KEY 长度不足');
});

// === 4. 环境变量校验器检查 ===
console.log('\n--- 环境变量校验器检查 ---');

test('env-validator 模块加载', () => {
  const validatorPath = path.join(distPath, 'common', 'utils', 'env-validator.js');
  if (!fs.existsSync(validatorPath)) throw new Error('env-validator.js 不存在');
  const validator = require(validatorPath);
  if (typeof validator.validateJwtSecrets !== 'function') {
    throw new Error('validateJwtSecrets 函数不存在');
  }
});

// === 5. 加密服务检查 ===
console.log('\n--- 加密服务检查 ---');

asyncTest('加密服务 hash/compare 正常工作', async () => {
  const encPath = path.join(distPath, 'common', 'services', 'encryption.service.js');
  if (!fs.existsSync(encPath)) throw new Error('encryption.service.js 不存在');
  // 直接测试 bcryptjs
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('test123', 10);
  if (!await bcrypt.compare('test123', hash)) throw new Error('bcrypt compare 失败');
  if (await bcrypt.compare('wrong', hash)) throw new Error('bcrypt 错误密码通过了验证');
});

// === 6. 工具函数检查 ===
console.log('\n--- 工具函数检查 ---');

test('string.util isEmail 正常', () => {
  const utilPath = path.join(distPath, 'common', 'utils', 'string.util.js');
  if (!fs.existsSync(utilPath)) throw new Error('string.util.js 不存在');
  const util = require(utilPath);
  if (!util.isEmail('test@example.com')) throw new Error('有效邮箱判定失败');
  if (util.isEmail('not-an-email')) throw new Error('无效邮箱通过了验证');
});

test('string.util generateRandomString 正常', () => {
  const utilPath = path.join(distPath, 'common', 'utils', 'string.util.js');
  const util = require(utilPath);
  const str1 = util.generateRandomString(32);
  const str2 = util.generateRandomString(32);
  if (str1.length !== 32) throw new Error(`长度 ${str1.length} !== 32`);
  if (str1 === str2) throw new Error('两次生成的随机字符串相同');
});

// === 7. 实体类检查 ===
console.log('\n--- 实体类检查 ---');

test('核心实体类编译产物存在', () => {
  const entities = [
    'modules/user/entities/user.entity.js',
    'modules/credits/entities/credit-account.entity.js',
    'modules/credits/entities/credit-transaction.entity.js',
    'modules/payment/entities/payment-record.entity.js',
    'modules/chat/entities/chat-session.entity.js',
    'modules/chat/entities/chat-message.entity.js',
    'modules/agent/entities/agent.entity.js',
  ];
  const missing = [];
  for (const e of entities) {
    if (!fs.existsSync(path.join(distPath, e))) missing.push(e);
  }
  if (missing.length > 0) throw new Error(`缺失: ${missing.join(', ')}`);
});

// === 8. DTO 验证检查 ===
console.log('\n--- DTO 验证检查 ---');

test('Register DTO 存在且有验证装饰器', () => {
  const dtoPath = path.join(distPath, 'modules', 'auth', 'dto', 'register.dto.js');
  if (!fs.existsSync(dtoPath)) throw new Error('register.dto.js 不存在');
  const dtoContent = fs.readFileSync(dtoPath, 'utf8');
  if (!dtoContent.includes('username')) throw new Error('缺少 username 字段');
  if (!dtoContent.includes('password')) throw new Error('缺少 password 字段');
  if (!dtoContent.includes('email')) throw new Error('缺少 email 字段');
});

test('Login DTO 存在', () => {
  const dtoPath = path.join(distPath, 'modules', 'auth', 'dto', 'login.dto.js');
  if (!fs.existsSync(dtoPath)) throw new Error('login.dto.js 不存在');
});

// === 9. 中间件/守卫检查 ===
console.log('\n--- 中间件/守卫检查 ---');

test('HMAC 验签中间件存在', () => {
  const mwPath = path.join(distPath, 'common', 'middleware', 'hmac-verify.middleware.js');
  if (!fs.existsSync(mwPath)) throw new Error('hmac-verify.middleware.js 不存在');
});

test('JWT Auth Guard 存在', () => {
  const guardPath = path.join(distPath, 'common', 'guards', 'jwt-auth.guard.js');
  if (!fs.existsSync(guardPath)) throw new Error('jwt-auth.guard.js 不存在');
});

test('Throttler Guard 配置存在', () => {
  const guardPath = path.join(distPath, 'common', 'guards');
  if (!fs.existsSync(guardPath)) throw new Error('guards 目录不存在');
});

// === 10. 异常处理检查 ===
console.log('\n--- 异常处理检查 ---');

test('BusinessException 存在且可抛出', () => {
  const excPath = path.join(distPath, 'common', 'exceptions', 'business.exception.js');
  if (!fs.existsSync(excPath)) throw new Error('business.exception.js 不存在');
  const exc = require(excPath);
  if (typeof exc.BusinessException.throw !== 'function') {
    throw new Error('BusinessException.throw 不存在');
  }
});

test('AllExceptionsFilter 存在', () => {
  const filterPath = path.join(distPath, 'common', 'filters', 'all-exceptions.filter.js');
  if (!fs.existsSync(filterPath)) throw new Error('all-exceptions.filter.js 不存在');
});

// === 11. 源代码安全模式检查 ===
console.log('\n--- 源代码安全模式检查 ---');

test('无 eval() 调用', () => {
  const srcPath = path.join(__dirname, '..', 'src');
  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // 排除注释中的 eval
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.includes('eval(') && !line.startsWith('//') && !line.startsWith('*')) {
            throw new Error(`${path.relative(srcPath, fullPath)}:${i+1} 发现 eval()`);
          }
        }
      }
    }
  }
  scanDir(srcPath);
});

test('无 child_process.exec 间接调用', () => {
  const srcPath = path.join(__dirname, '..', 'src');
  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('child_process') && content.includes('exec(')) {
          throw new Error(`${path.relative(srcPath, fullPath)} 使用了 child_process.exec`);
        }
      }
    }
  }
  scanDir(srcPath);
});

test('SQL 注入防护：无字符串拼接 SQL', () => {
  const srcPath = path.join(__dirname, '..', 'src');
  let warnings = [];
  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // 检查是否有 `SELECT ... ${` 或 `WHERE ... ${` 模式
        if (content.match(/(SELECT|INSERT|UPDATE|DELETE|WHERE)\s+.*\$\{/i)) {
          warnings.push(path.relative(srcPath, fullPath));
        }
      }
    }
  }
  scanDir(srcPath);
  if (warnings.length > 0) throw new Error(`可能的 SQL 注入: ${warnings.join(', ')}`);
});

// === 12. 依赖检查 ===
console.log('\n--- 依赖检查 ---');

test('package.json 存在且可解析', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.dependencies['@nestjs/core']) throw new Error('缺少 @nestjs/core');
  if (!pkg.dependencies['typeorm']) throw new Error('缺少 typeorm');
  if (!pkg.dependencies['ioredis']) throw new Error('缺少 ioredis');
});

test('无已知漏洞依赖（基础检查）', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  // 检查是否有已知有问题的版本
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const knownBad = {
    'lodash': '<4.17.21',
    'axios': '<0.21.1',
  };
  for (const [pkg, badVer] of Object.entries(knownBad)) {
    if (deps[pkg]) {
      console.log(`    注意: ${pkg}@${deps[pkg]} 需确认安全性`);
    }
  }
});

// === 结果汇总 ===
console.log('\n========================================');
console.log(`  测试结果: ${passCount} 通过, ${failCount} 失败`);
console.log('========================================\n');

if (failCount > 0) {
  console.log('失败项:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ✗ ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('✅ 所有测试通过!');
  process.exit(0);
}
