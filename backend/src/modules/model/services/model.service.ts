import { Injectable } from '@nestjs/common';

@Injectable()
export class ModelService {
  health() {
    return { status: 'ok', module: 'model' };
  }
}
