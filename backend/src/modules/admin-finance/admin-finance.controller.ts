import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminFinanceService } from './admin-finance.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto';
import { RefundDto } from './dto/refund.dto';
import { IssueInvoiceDto } from './dto/issue-invoice.dto';
import { RejectInvoiceDto } from './dto/reject-invoice.dto';
import { InvoiceAuditDto } from './dto/invoice-audit.dto';
import { AdjustReconciliationDto } from './dto/adjust-reconciliation.dto';

/**
 * 管理端积分财务控制器
 * 数据合同真源：Task 24 - 积分财务管理
 *
 * 端点（对齐前端 admin-finance-api.ts）：
 *   GET   /admin/credits/transactions           积分流水列表
 *   GET   /admin/credits/transactions/stats     积分流水统计
 *   GET   /admin/credits/transactions/:id       积分流水详情
 *   GET   /admin/recharge-orders                充值订单列表
 *   GET   /admin/recharge-orders/:id            充值订单详情
 *   POST  /admin/recharge-orders/:id/refund     订单退款
 *   GET   /admin/invoices                       发票列表
 *   GET   /admin/invoices/:id                   发票详情
 *   POST  /admin/invoices/:id/issue             开具发票
 *   POST  /admin/invoices/:id/reject            驳回发票
 *   POST  /admin/invoices/:id/audit             发票审核（action=issue/reject）
 *   GET   /admin/reconciliation/diffs           对账差异列表
 *   GET   /admin/reconciliation/stats           对账差异统计
 *   POST  /admin/reconciliation/:id/adjust      手动调整差异
 *   POST  /admin/reconciliation/:id/ignore      标记忽略差异
 *   GET   /admin/dashboard                      财务仪表盘
 */
@ApiTags('管理端-积分财务')
@ApiBearerAuth()
@Public()
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminFinanceController {
  constructor(private readonly service: AdminFinanceService) {}

  // ============ 积分流水 ============

  @Get('credits/transactions')
  @ApiOperation({ summary: '积分流水列表' })
  async listTransactions(@Query() query: TransactionQueryDto) {
    return this.service.listTransactions(query);
  }

  @Get('credits/transactions/stats')
  @ApiOperation({ summary: '积分流水统计' })
  async transactionStats(@Query() query: TransactionQueryDto) {
    return this.service.getTransactionStats(query);
  }

  @Get('credits/transactions/:id')
  @ApiOperation({ summary: '积分流水详情' })
  async transactionDetail(@Param('id', ParseIntPipe) id: number) {
    return this.service.getTransactionDetail(id);
  }

  // ============ 充值订单 ============

  @Get('recharge-orders')
  @ApiOperation({ summary: '充值订单列表' })
  async listOrders(@Query() query: OrderQueryDto) {
    return this.service.listOrders(query);
  }

  @Get('recharge-orders/:id')
  @ApiOperation({ summary: '充值订单详情' })
  async orderDetail(@Param('id', ParseIntPipe) id: number) {
    return this.service.getOrderDetail(id);
  }

  @Post('recharge-orders/:id/refund')
  @ApiOperation({ summary: '订单退款' })
  async refundOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefundDto,
  ) {
    await this.service.refundOrder(id, dto);
  }

  // ============ 发票 ============

  @Get('invoices')
  @ApiOperation({ summary: '发票列表' })
  async listInvoices(@Query() query: InvoiceQueryDto) {
    return this.service.listInvoices(query);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: '发票详情' })
  async invoiceDetail(@Param('id', ParseIntPipe) id: number) {
    return this.service.getInvoiceDetail(id);
  }

  @Post('invoices/:id/issue')
  @ApiOperation({ summary: '开具发票' })
  async issueInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueInvoiceDto,
  ) {
    await this.service.issueInvoice(id, dto);
  }

  @Post('invoices/:id/reject')
  @ApiOperation({ summary: '驳回发票' })
  async rejectInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectInvoiceDto,
  ) {
    await this.service.rejectInvoice(id, dto);
  }

  @Post('invoices/:id/audit')
  @ApiOperation({ summary: '发票审核（action=issue/reject）' })
  async auditInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InvoiceAuditDto,
  ) {
    await this.service.auditInvoice(id, dto);
  }

  // ============ 对账 ============

  @Get('reconciliation/diffs')
  @ApiOperation({ summary: '对账差异列表' })
  async listReconciliationDiffs(@Query() query: ReconciliationQueryDto) {
    return this.service.listReconciliationDiffs(query);
  }

  @Get('reconciliation/stats')
  @ApiOperation({ summary: '对账差异统计' })
  async reconciliationStats(@Query() query: ReconciliationQueryDto) {
    return this.service.getReconciliationStats(query);
  }

  @Post('reconciliation/:id/adjust')
  @ApiOperation({ summary: '手动调整差异' })
  async adjustDiff(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustReconciliationDto,
  ) {
    await this.service.adjustReconciliationDiff(id, dto);
  }

  @Post('reconciliation/:id/ignore')
  @ApiOperation({ summary: '标记忽略差异' })
  async ignoreDiff(@Param('id', ParseIntPipe) id: number) {
    await this.service.ignoreReconciliationDiff(id);
  }

  // ============ 仪表盘 ============

  @Get('dashboard')
  @ApiOperation({ summary: '财务仪表盘' })
  async dashboard() {
    return this.service.getDashboard();
  }
}
