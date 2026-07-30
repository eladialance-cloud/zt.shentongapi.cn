import { Injectable } from '@nestjs/common';

@Injectable()
export class N8nService {
  health() {
    return { status: 'ok', module: 'n8n' };
  }

  async listWorkflows(userId: number, options?: any) {
    return [];
  }

  async triggerWorkflow(userId: number, n8nInstanceId: string | number, workflowId: string | number, payload?: any) {
    return { executionId: Date.now(), workflowId, status: 'started' };
  }
}