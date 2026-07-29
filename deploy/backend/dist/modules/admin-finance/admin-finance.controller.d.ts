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
export declare class AdminFinanceController {
    private readonly service;
    constructor(service: AdminFinanceService);
    listTransactions(query: TransactionQueryDto): Promise<{
        list: {
            id: number;
            txNo: string;
            userId: number;
            username: string | undefined;
            type: import("../credits/entities/credit-transaction.entity").CreditTxnType;
            source: import("../credits/entities/credit-transaction.entity").CreditTxnSource;
            amount: number;
            balanceBefore: number;
            balanceAfter: number;
            relatedId: string | undefined;
            remark: string | undefined;
            createdAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    transactionStats(query: TransactionQueryDto): Promise<{
        total: number;
        totalIncome: number;
        totalOutcome: number;
    }>;
    transactionDetail(id: number): Promise<{
        id: number;
        txNo: string;
        userId: number;
        username: string | undefined;
        type: import("../credits/entities/credit-transaction.entity").CreditTxnType;
        source: import("../credits/entities/credit-transaction.entity").CreditTxnSource;
        amount: number;
        balanceBefore: number;
        balanceAfter: number;
        relatedId: string | undefined;
        remark: string | undefined;
        createdAt: Date;
    }>;
    listOrders(query: OrderQueryDto): Promise<{
        list: {
            id: number;
            orderNo: string;
            userId: number;
            username: string | undefined;
            amount: number;
            credits: number;
            paymentMethod: string;
            status: "pending" | "failed" | "paid" | "refunded";
            createdAt: Date;
            paidAt: Date | undefined;
            refundedAt: Date | undefined;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    orderDetail(id: number): Promise<{
        id: number;
        orderNo: string;
        userId: number;
        username: string | undefined;
        amount: number;
        credits: number;
        paymentMethod: string;
        status: "pending" | "failed" | "paid" | "refunded";
        createdAt: Date;
        paidAt: Date | undefined;
        refundedAt: Date | undefined;
    }>;
    refundOrder(id: number, dto: RefundDto): Promise<void>;
    listInvoices(query: InvoiceQueryDto): Promise<{
        list: {
            id: number;
            applyNo: string;
            userId: number;
            username: string | undefined;
            orderNo: string;
            invoiceType: import("./entities/invoice.entity").InvoiceType;
            title: string;
            taxNo: string | undefined;
            amount: number;
            status: import("./entities/invoice.entity").InvoiceStatus;
            invoiceNumber: string | undefined;
            invoiceUrl: string | undefined;
            rejectReason: string | undefined;
            createdAt: Date;
            issuedAt: Date | undefined;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    invoiceDetail(id: number): Promise<{
        id: number;
        applyNo: string;
        userId: number;
        username: string | undefined;
        orderNo: string;
        invoiceType: import("./entities/invoice.entity").InvoiceType;
        title: string;
        taxNo: string | undefined;
        amount: number;
        status: import("./entities/invoice.entity").InvoiceStatus;
        invoiceNumber: string | undefined;
        invoiceUrl: string | undefined;
        rejectReason: string | undefined;
        createdAt: Date;
        issuedAt: Date | undefined;
    }>;
    issueInvoice(id: number, dto: IssueInvoiceDto): Promise<void>;
    rejectInvoice(id: number, dto: RejectInvoiceDto): Promise<void>;
    auditInvoice(id: number, dto: InvoiceAuditDto): Promise<void>;
    listReconciliationDiffs(query: ReconciliationQueryDto): Promise<{
        list: {
            id: number;
            type: import("../reconciliation/entities/reconciliation-diff.entity").ReconciliationDiffType;
            userId: number | undefined;
            username: string | undefined;
            diffAmount: number;
            detail: string;
            status: import("../reconciliation/entities/reconciliation-diff.entity").ReconciliationDiffStatus;
            createdAt: Date;
            resolvedAt: Date | undefined;
            resolveRemark: string | undefined;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    reconciliationStats(query: ReconciliationQueryDto): Promise<{
        total: number;
        pending: number;
        resolved: number;
        ignored: number;
        totalDiffAmount: number;
    }>;
    adjustDiff(id: number, dto: AdjustReconciliationDto): Promise<void>;
    ignoreDiff(id: number): Promise<void>;
    dashboard(): Promise<{
        orderStats: {
            total: number;
            paid: number;
            refunded: number;
        };
        totalRevenue: number;
        totalTransactions: number;
        pendingInvoices: number;
        pendingDiffs: number;
    }>;
}
