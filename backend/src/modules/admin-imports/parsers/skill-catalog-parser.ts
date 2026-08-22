import type { ImportFile } from './import-parser.interface';

/**
 * 技能目录（索引）仓库解析器：识别 awesome-openclaw-skills 这类 categories/*.md 目录仓库。
 *
 * 目录条目格式（逐行）：
 *   - [skill-name](https://clawskills.sh/skills/owner-repo) - description
 *   - [skill-name](https://clawhub.ai/owner/repo) - description
 *   - [skill-name](https://github.com/owner/repo) - description
 */

export interface SkillRepoCandidate {
  owner: string;
  repo: string;
  /** 导入校验时探测到的仓库默认分支（桌面端可直接使用，省一次 API 探测） */
  defaultBranch?: string;
}

export interface SkillCatalogEntry {
  /** 链接文本（技能名） */
  name: string;
  description: string;
  /** 分类文件名（不含 .md，如 ai-and-llms） */
  category: string;
  /** 原始链接 */
  sourceUrl: string;
  /** 候选 GitHub 仓库（按命中概率排序，最多 2 个；首个失败后尝试下一个） */
  candidates: SkillRepoCandidate[];
}

/** 从链接解析候选仓库：
 *  - clawhub.ai/owner/repo → 直接映射
 *  - clawskills.sh/skills/<owner-repo> → 由于 owner/repo 可能含连字符，
 *    生成「首个连字符切分」与「第二个连字符切分」两个候选（去重，最多 2 个）
 *  - github.com/owner/repo → 直接映射
 */
export function resolveRepoCandidates(url: string): SkillRepoCandidate[] {
  const u = (url || '').trim();
  let m: RegExpMatchArray | null;

  m = u.match(/^https?:\/\/clawhub\.ai\/([^/]+)\/([^/]+)\/?$/);
  if (m) return [{ owner: m[1], repo: m[2] }];

  m = u.match(/^https?:\/\/clawskills\.sh\/skills\/([^/]+)\/?$/);
  if (m) {
    const slug = m[1];
    const parts = slug.split('-').filter(Boolean);
    if (parts.length < 2) return [];
    const out: SkillRepoCandidate[] = [];
    // 候选1：首个连字符切分（owner 一般为单词，命中率最高）
    out.push({ owner: parts[0], repo: parts.slice(1).join('-') });
    // 候选2：第二个连字符切分（owner 本身含连字符，如 browseract-cli）
    if (parts.length >= 3) {
      out.push({ owner: parts.slice(0, 2).join('-'), repo: parts.slice(2).join('-') });
    }
    // 去重
    const seen = new Set<string>();
    return out.filter((c) => {
      const key = c.owner + '/' + c.repo;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (m) return [{ owner: m[1], repo: m[2].replace(/\.git$/, '') }];

  return [];
}

/** 解析 categories/*.md 目录文件 → 技能条目列表 */
export class SkillCatalogParser {
  parseCatalogFiles(files: ImportFile[]): SkillCatalogEntry[] {
    const entries: SkillCatalogEntry[] = [];
    for (const file of files) {
      if (file.content == null) continue;
      const base = file.path.split('/').pop() ?? '';
      const category = base.toLowerCase().endsWith('.md') ? base.slice(0, -3) : base;
      const lines = file.content.split(/\r?\n/);
      for (const raw of lines) {
        const line = raw.trim();
        const m = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s*-\s*(.+)$/);
        if (!m) continue;
        const name = m[1].trim();
        const candidates = resolveRepoCandidates(m[2]);
        if (!candidates.length) continue;
        entries.push({
          name: name || candidates[0].repo,
          description: m[3].trim().slice(0, 2000),
          category,
          sourceUrl: m[2],
          candidates,
        });
      }
    }
    return entries;
  }
}
