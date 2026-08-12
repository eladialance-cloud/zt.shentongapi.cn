// 技能源（GitHub 技能目录清单）类型
export interface UserSkillSource {
  id: number
  name: string
  description: string
  category: string
  sourceUrl: string
  repoUrl: string
  candidates: Array<{ owner: string; repo: string }>
}
