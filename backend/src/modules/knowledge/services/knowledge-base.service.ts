import { Injectable } from '@nestjs/common';

@Injectable()
export class KnowledgeBaseService {
  health() {
    return { status: 'ok', module: 'knowledgeBase' };
  }
}
