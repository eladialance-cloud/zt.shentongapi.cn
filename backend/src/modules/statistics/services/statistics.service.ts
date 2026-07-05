import { Injectable } from '@nestjs/common';

@Injectable()
export class StatisticsService {
  health() {
    return { status: 'ok', module: 'statistics' };
  }
}
