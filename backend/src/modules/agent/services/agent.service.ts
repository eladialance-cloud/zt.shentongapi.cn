import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentService {
  health() {
    return { status: 'ok', module: 'agent' };
  }
}
