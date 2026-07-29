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
exports.SyncRecordEntity = void 0;
const typeorm_1 = require("typeorm");
let SyncRecordEntity = class SyncRecordEntity {
    id;
    userId;
    clientTxnId;
    type;
    payload;
    status;
    errorMsg;
    createdAt;
    processedAt;
};
exports.SyncRecordEntity = SyncRecordEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], SyncRecordEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], SyncRecordEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'client_txn_id', length: 64 }),
    __metadata("design:type", String)
], SyncRecordEntity.prototype, "clientTxnId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], SyncRecordEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json' }),
    __metadata("design:type", Object)
], SyncRecordEntity.prototype, "payload", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        length: 16,
        default: 'pending',
    }),
    __metadata("design:type", String)
], SyncRecordEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_msg', type: 'text', nullable: true }),
    __metadata("design:type", String)
], SyncRecordEntity.prototype, "errorMsg", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], SyncRecordEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'processed_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], SyncRecordEntity.prototype, "processedAt", void 0);
exports.SyncRecordEntity = SyncRecordEntity = __decorate([
    (0, typeorm_1.Entity)('sync_records')
], SyncRecordEntity);
//# sourceMappingURL=sync-record.entity.js.map