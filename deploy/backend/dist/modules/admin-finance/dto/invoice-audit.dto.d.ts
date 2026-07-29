export declare class InvoiceAuditDto {
    action: 'issue' | 'reject';
    invoiceNumber?: string;
    invoiceUrl?: string;
    reason?: string;
}
