import type { ImportedAssetDraft } from './import-parser.interface';
import { SkillParser } from './skill-parser';
import type { SkillCatalogEntry, SkillRepoCandidate } from './skill-catalog-parser';

/** 单个技能仓库的 SKILL.md 拉取器（由调用方注入，便于测试） */
export interface SkillRepoFetcher {
  /**
   * 拉取指定仓库的 SKILL.md（优先仓库根，其次 skills/ 子目录）。
   * 返回 null 表示该仓库无 SKILL.md；抛错视为该仓库拉取失败（计入 failed，不影响整体）。
   */
  fetchSkillMd(owner: string, repo: string): Promise<{ path: string; content: string } | null>;
}

export interface CatalogExpandStats {
  /** 目录中解析到的技能条目总数 */
  totalEntries: number;
  /** 实际尝试展开的条目数（受 maxSkills 限制） */
  attempted: number;
  /** 成功取到 SKILL.md 并生成草稿的条目数 */
  fetched: number;
  /** 拉取失败 / 仓库无 SKILL.md 的条目数 */
  failed: number;
}

export interface CatalogExpandResult {
  drafts: ImportedAssetDraft[];
  stats: CatalogExpandStats;
}

const skillParser = new SkillParser();

/**
 * 目录仓库展开器：把目录条目逐个解析为具体技能草稿。
 * - 按分类轮询选取（maxSkills 覆盖尽可能多的分类）
 * - 单个仓库失败（无 SKILL.md / 拉取异常）只计数，不中断整体导入
 */
export class SkillCatalogExpander {
  constructor(private readonly fetcher: SkillRepoFetcher) {}

  async expand(entries: SkillCatalogEntry[], maxSkills: number): Promise<CatalogExpandResult> {
    const total = entries.length;
    if (total === 0) return { drafts: [], stats: { totalEntries: 0, attempted: 0, fetched: 0, failed: 0 } };
    const cap = Math.max(1, Math.min(maxSkills, total));

    // 按分类分组（保持原顺序），轮询选取保证分类覆盖
    const byCategory = new Map<string, SkillCatalogEntry[]>();
    for (const e of entries) {
      const key = e.category || 'other';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(e);
    }
    const keys = Array.from(byCategory.keys());
    const perCategory = Math.max(1, Math.ceil(cap / keys.length));
    const selected: SkillCatalogEntry[] = [];
    while (selected.length < cap) {
      let progressed = false;
      for (const key of keys) {
        if (selected.length >= cap) break;
        const bucket = byCategory.get(key)!;
        for (let i = 0; i < perCategory && bucket.length > 0 && selected.length < cap; i++) {
          selected.push(bucket.shift()!);
          progressed = true;
        }
      }
    }

    const drafts: ImportedAssetDraft[] = [];
    let fetched = 0;
    let failed = 0;
    for (const entry of selected) {
      let got: { path: string; content: string } | null = null;
      let matched: SkillRepoCandidate | null = null;
      for (const cand of entry.candidates) {
        try {
          const res = await this.fetcher.fetchSkillMd(cand.owner, cand.repo);
          if (res && res.content) {
            got = res;
            matched = cand;
            break;
          }
        } catch {
          // 单个仓库拉取异常：尝试下一个候选
        }
      }
      if (!got || !matched) {
        failed++;
        continue;
      }
      const repoUrl = 'https://github.com/' + matched.owner + '/' + matched.repo;
      const parsed = await skillParser.parse({
        repoUrl,
        branch: 'HEAD',
        topics: [],
        files: [{ path: got.path, content: got.content }],
      });
      for (const d of parsed) {
        // 目录分类优先作为初始分类（后续 AI classify 会再次归类到平台分类）
        if (entry.category) d.category = entry.category;
        d.sourceType = 'github';
        d.sourceRepo = repoUrl;
        d.sourcePath = got.path;
        drafts.push(d);
      }
      fetched++;
    }
    return {
      drafts,
      stats: { totalEntries: total, attempted: selected.length, fetched, failed },
    };
  }
}
