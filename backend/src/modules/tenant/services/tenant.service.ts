import { Injectable } from '@nestjs/common';

@Injectable()
export class TenantService {
  health() {
    return { status: 'ok', module: 'tenant' };
  }
}
