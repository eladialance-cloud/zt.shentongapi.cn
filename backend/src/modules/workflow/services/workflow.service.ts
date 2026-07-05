import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkflowService {
  health() {
    return { status: 'ok', module: 'workflow' };
  }
}
