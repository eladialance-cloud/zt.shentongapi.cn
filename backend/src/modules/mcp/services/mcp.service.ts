import { Injectable } from '@nestjs/common';

@Injectable()
export class McpService {
  health() {
    return { status: 'ok', module: 'mcp' };
  }
}
