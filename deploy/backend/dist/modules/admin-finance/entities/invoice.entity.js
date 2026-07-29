"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceEntity = void 0;
const typeorm_1 = require("typeorm");
let InvoiceEntity = class InvoiceEntity {
    id;
    applyNo;
    userId;
    orderNo;
    invoiceType;
    title;
    taxNo;
    amount;
    status;
    invoiceNumber;
    invoiceUrl;
    rejectReason;
    issuedAt;
    createdAt;
};
exports.InvoiceEntity = InvoiceEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], InvoiceEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'apply_no', length: 64 }),
    __metadata("design:type", String)
], InvoiceEntity.prototype, "applyNo", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], InvoiceEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'order_no', length: 64 }),
    __metadata("design:type", String)
], InvoiceEntity.prototype, "orderNo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'invoice_type', length: 16, default: 'personal' }),
    __metadata("design:type", String)
], InvoiceEntity.prototype, "invoiceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 256 }),
    __metadata("design:type", String)
], InvoiceEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'tax_no', length: 64, nullable: true }),
    __metadata("design:type", String)
], InvoiceEntity.prototype, "taxNo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], InvoiceEntity.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'varchar',
        length: 16,
        default: 'pending',
    }),
    __metadata("design:type", String)
], InvoiceEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'invoice_number', length: 128, nullable: true }),
    __metadata("design:type", String)
], InvoiceEntity.prototype, "invoiceNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'invoice_url', length: 512, nullable: true }),
    __metadata("design:type", String)
], InvoiceEntity.prototype, "invoiceUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reject_reason', length: 512, nullable: true }),
    __metadata("design:type", String)
], InvoiceEntity.prototype, "rejectReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'issued_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], InvoiceEntity.prototype, "issuedAt", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], InvoiceEntity.prototype, "createdAt", void 0);
exports.InvoiceEntity = InvoiceEntity = __decorate([
    (0, typeorm_1.Entity)('invoices')
], InvoiceEntity);
//# sourceMappingURL=invoice.entity.js.map