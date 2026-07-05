import { Injectable } from '@nestjs/common';

@Injectable()
export class N8nService {
  health() {
    return { status: 'ok', module: 'n8n' };
  }
}
