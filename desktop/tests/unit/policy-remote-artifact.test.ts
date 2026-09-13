// 远端技能/产物供应链策略回归测试（安全审计 S-42）
//
// 背景：远端技能目录是 Agent 会读取并执行的位置 —— 只要 URL 前缀是 http(s) 就能把任意内容写进去，
// 等于「远端内容 → 本地 Agent 能力」的持久化通道。本测试锁定四道闸：
// 来源白名单 / 内容形态与体积 / 归档条目穿越守卫 / 安装目录禁止可执行扩展名。
import {
  MAX_SKILL_BYTES,
  evaluateRemoteSkillUrl,
  evaluateSkillContent,
  isForbiddenArtifactEntryName,
  isSafeArchiveEntryPath,
} from '../../electron/main/policy/remote-artifact-policy'

describe('evaluateRemoteSkillUrl', () => {
  it('放行自有域名与代码托管域名', () => {
    for (const url of [
      'https://zt.shentongapi.cn/skills/foo/SKILL.md',
      'https://github.com/owner/repo/raw/main/SKILL.md',
      'https://raw.githubusercontent.com/owner/repo/main/SKILL.md',
      'https://gitee.com/owner/repo/raw/main/SKILL.md',
    ]) {
      const r = evaluateRemoteSkillUrl(url)
      expect(r.ok).toBe(true)
      if (r.ok) expect(typeof r.host).toBe('string')
    }
  })

  it('拒绝白名单外的域名（含后缀伪装）', () => {
    for (const url of [
      'https://evil.example.com/SKILL.md',
      'https://github.com.evil.example.com/SKILL.md',
      'https://raw.githubusercontent.com.evil.example.com/SKILL.md',
    ]) {
      expect(evaluateRemoteSkillUrl(url)).toEqual({ ok: false, reason: 'HOST_NOT_ALLOWED' })
    }
  })

  it('非 https 一律拒绝（环回 http 例外，用于本机开发）', () => {
    expect(evaluateRemoteSkillUrl('http://evil.example.com/SKILL.md')).toEqual({ ok: false, reason: 'PROTOCOL' })
    expect(evaluateRemoteSkillUrl('file:///etc/passwd')).toEqual({ ok: false, reason: 'PROTOCOL' })
    expect(evaluateRemoteSkillUrl('ftp://github.com/x.md')).toEqual({ ok: false, reason: 'PROTOCOL' })
    expect(evaluateRemoteSkillUrl('http://127.0.0.1:8080/SKILL.md').ok).toBe(true)
  })

  it('URL 内不允许携带凭据（防钓鱼外带 / 日志泄露）', () => {
    expect(evaluateRemoteSkillUrl('https://user:pass@github.com/x/SKILL.md')).toEqual({
      ok: false,
      reason: 'CREDENTIALS_IN_URL',
    })
  })

  it('技能文件扩展名白名单', () => {
    expect(evaluateRemoteSkillUrl('https://github.com/o/r/raw/main/skill.exe')).toEqual({
      ok: false,
      reason: 'EXTENSION_NOT_ALLOWED',
    })
    expect(evaluateRemoteSkillUrl('https://github.com/o/r/raw/main/run.bat')).toEqual({
      ok: false,
      reason: 'EXTENSION_NOT_ALLOWED',
    })
    for (const name of ['SKILL.md', 'skill.markdown', 'note.txt', 'meta.json', 'cfg.yaml', 'cfg.yml']) {
      expect(evaluateRemoteSkillUrl('https://github.com/o/r/raw/main/' + name).ok).toBe(true)
    }
  })

  it('空值 / 非字符串 / 非 URL fail-closed', () => {
    expect(evaluateRemoteSkillUrl('')).toEqual({ ok: false, reason: 'EMPTY' })
    expect(evaluateRemoteSkillUrl(null)).toEqual({ ok: false, reason: 'EMPTY' })
    expect(evaluateRemoteSkillUrl(42)).toEqual({ ok: false, reason: 'EMPTY' })
    expect(evaluateRemoteSkillUrl('not a url')).toEqual({ ok: false, reason: 'PARSE' })
  })

  it('可通过 opts.allowedHosts 追加来源（企业私有仓库）', () => {
    const allowed = new Set(['skills.corp.internal'])
    expect(evaluateRemoteSkillUrl('https://skills.corp.internal/x/SKILL.md', { allowedHosts: allowed }).ok).toBe(true)
    expect(evaluateRemoteSkillUrl('https://other.corp.internal/x/SKILL.md', { allowedHosts: allowed })).toEqual({
      ok: false,
      reason: 'HOST_NOT_ALLOWED',
    })
  })
})

describe('evaluateSkillContent', () => {
  it('正常文本放行', () => {
    expect(evaluateSkillContent('# Skill\n\n用法说明')).toEqual({ ok: true })
  })

  it('含 NUL 字节的内容判为二进制', () => {
    expect(evaluateSkillContent('abc\u0000def')).toEqual({ ok: false, reason: 'BINARY_CONTENT' })
  })

  it('超过体积上限拒绝（默认 256KB）', () => {
    const big = 'A'.repeat(MAX_SKILL_BYTES + 1)
    expect(evaluateSkillContent(big)).toEqual({ ok: false, reason: 'TOO_LARGE' })
    expect(evaluateSkillContent('A'.repeat(MAX_SKILL_BYTES))).toEqual({ ok: true })
  })

  it('空值 / 非字符串拒绝', () => {
    expect(evaluateSkillContent('')).toEqual({ ok: false, reason: 'EMPTY' })
    expect(evaluateSkillContent(undefined)).toEqual({ ok: false, reason: 'EMPTY' })
  })
})

describe('isSafeArchiveEntryPath', () => {
  it('放行普通相对路径', () => {
    expect(isSafeArchiveEntryPath('repo-main/SKILL.md')).toBe(true)
    expect(isSafeArchiveEntryPath('SKILL.md')).toBe(true)
    expect(isSafeArchiveEntryPath('a/b/c/scripts/tool.py')).toBe(true)
  })

  it('拒绝穿越 / 绝对路径 / 盘符 / UNC / NUL', () => {
    for (const entry of [
      '../evil.sh',
      'repo/../../evil.sh',
      '/etc/passwd',
      'C:\\Windows\\System32\\x.dll',
      '\\\\server\\share\\x',
      'a\u0000b',
      '',
      null,
    ]) {
      expect(isSafeArchiveEntryPath(entry)).toBe(false)
    }
  })
})

describe('isForbiddenArtifactEntryName', () => {
  it('禁止可执行与脚本宿主扩展名', () => {
    for (const name of ['a.exe', 'a.dll', 'a.scr', 'a.com', 'a.msi', 'a.lnk', 'run.bat', 'run.cmd', 'x.vbs', 'x.hta', 'x.ps1', 'x.jar']) {
      expect(isForbiddenArtifactEntryName(name)).toBe(true)
    }
  })

  it('技能合法内容（文档与脚本语言源文件）放行', () => {
    for (const name of ['SKILL.md', 'meta.json', 'cfg.yml', 'scripts/tool.py', 'scripts/run.mjs', 'index.js', 'setup.sh', 'data.csv']) {
      expect(isForbiddenArtifactEntryName(name)).toBe(false)
    }
  })

  it('大小写不敏感，空值不误判为禁止', () => {
    expect(isForbiddenArtifactEntryName('RUN.BAT')).toBe(true)
    expect(isForbiddenArtifactEntryName('')).toBe(false)
    expect(isForbiddenArtifactEntryName(null)).toBe(false)
  })
})
