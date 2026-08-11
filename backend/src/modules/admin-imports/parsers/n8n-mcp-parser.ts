import type { AssetImportType } from '../admin-imports.constants';
import { McpParser } from './mcp-parser';

/** n8n MCP 解析器：与 mcp-parser 相同，额外标记 payload.n8nMcp = true */
export class N8nMcpParser extends McpParser {
  override readonly type: AssetImportType = 'n8n_mcp';
  override readonly n8nMcp: boolean = true;
}
