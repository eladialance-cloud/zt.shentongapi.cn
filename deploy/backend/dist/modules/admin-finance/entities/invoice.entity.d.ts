export type InvoiceStatus = 'pending' | 'issued' | 'rejected';
export type InvoiceType = 'personal' | 'enterprise';
export declare class InvoiceEntity {
    id: number;
    applyNo: string;
    userId: number;
    orderNo: string;
    invoiceType: InvoiceType;
    title: string;
    taxNo?: string;
    amount: number;
    status: InvoiceStatus;
    invoiceNumber?: string;
    invoiceUrl?: string;
    rejectReason?: string;
    issuedAt?: Date;
    createdAt: Date;
}
