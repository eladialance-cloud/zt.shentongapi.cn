import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatService {
  health() {
    return { status: 'ok', module: 'chat' };
  }
}
