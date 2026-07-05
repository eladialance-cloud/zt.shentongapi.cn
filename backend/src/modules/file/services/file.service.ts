import { Injectable } from '@nestjs/common';

@Injectable()
export class FileService {
  health() {
    return { status: 'ok', module: 'file' };
  }
}
