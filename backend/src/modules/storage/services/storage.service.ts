import { Injectable } from '@nestjs/common';

@Injectable()
export class StorageService {
  health() {
    return { status: 'ok', module: 'storage' };
  }
}
