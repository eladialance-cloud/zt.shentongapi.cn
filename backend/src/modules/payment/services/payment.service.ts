import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentService {
  health() {
    return { status: 'ok', module: 'payment' };
  }

  async getAllPlans() {
    return [];
  }

  async createPlan(dto: any) {
    return { id: Date.now(), ...dto };
  }

  async updatePlan(id: number, dto: any) {
    return { id, ...dto };
  }

  async deletePlan(id: number) {
    return { success: true };
  }
}