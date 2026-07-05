import { Injectable } from '@nestjs/common';

@Injectable()
export class OpcService {
  health() {
    return { status: 'ok', module: 'opc' };
  }
}
