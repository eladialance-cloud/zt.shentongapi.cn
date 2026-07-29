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
exports.InviteCodeEntity = void 0;
const typeorm_1 = require("typeorm");
let InviteCodeEntity = class InviteCodeEntity {
    id;
    code;
    inviterId;
    inviteeId;
    status;
    expiresAt;
    createdAt;
};
exports.InviteCodeEntity = InviteCodeEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], InviteCodeEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'code', type: 'varchar', length: 32 }),
    __metadata("design:type", String)
], InviteCodeEntity.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'inviter_id', type: 'bigint' }),
    __metadata("design:type", Number)
], InviteCodeEntity.prototype, "inviterId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'invitee_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Object)
], InviteCodeEntity.prototype, "inviteeId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'status', type: 'varchar', length: 16, default: 'active' }),
    __metadata("design:type", String)
], InviteCodeEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expires_at', type: 'datetime' }),
    __metadata("design:type", Date)
], InviteCodeEntity.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], InviteCodeEntity.prototype, "createdAt", void 0);
exports.InviteCodeEntity = InviteCodeEntity = __decorate([
    (0, typeorm_1.Entity)('invite_codes')
], InviteCodeEntity);
//# sourceMappingURL=invite-code.entity.js.map