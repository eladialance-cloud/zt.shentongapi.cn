import { SOURCE_DIR_TO_CATEGORY } from '../../admin-agent/agent-import.constants';
import { categoryFromTopics } from './import-parser.interface';

/** GitHub topics → 分类；无命中再按目录名匹配（复用 agent-import 值集），兜底 other */
export function resolveAssetCategory(topics: string[], path: string): string {
  const fromTopics = categoryFromTopics(topics, SOURCE_DIR_TO_CATEGORY, 'other');
  if (fromTopics !== 'other') return fromTopics;
  const segments = path.split('/');
  segments.pop();
  for (const seg of segments) {
    const hit = SOURCE_DIR_TO_CATEGORY[seg.toLowerCase()];
    if (hit) return hit;
  }
  return 'other';
}
