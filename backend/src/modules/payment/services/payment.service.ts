import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentService {
  health() {
    return { status: 'ok', module: 'payment' };
  }
}
