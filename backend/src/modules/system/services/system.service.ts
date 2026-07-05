import { Injectable } from '@nestjs/common';

@Injectable()
export class SystemService {
  health() {
    return { status: 'ok', module: 'system' };
  }
}
