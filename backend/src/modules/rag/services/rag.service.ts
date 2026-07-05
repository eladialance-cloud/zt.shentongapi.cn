import { Injectable } from '@nestjs/common';

@Injectable()
export class RagService {
  health() {
    return { status: 'ok', module: 'rag' };
  }
}
