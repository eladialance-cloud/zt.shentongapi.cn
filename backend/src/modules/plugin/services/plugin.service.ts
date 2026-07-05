import { Injectable } from '@nestjs/common';

@Injectable()
export class PluginService {
  health() {
    return { status: 'ok', module: 'plugin' };
  }
}
