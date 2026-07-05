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
exports.UserEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let UserEntity = class UserEntity extends base_entity_1.BaseEntity {
    username;
    email;
    password;
    phone;
    avatar;
    status;
    realNameVerified;
    level;
    banReason;
    banDuration;
    banUntil;
    registerSource;
    inviterId;
    inviteCode;
    needsTenantSetup;
};
exports.UserEntity = UserEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ length: 64 }),
    __metadata("design:type", String)
], UserEntity.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], UserEntity.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128, select: false }),
    __metadata("design:type", String)
], UserEntity.prototype, "password", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ length: 20, nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "avatar", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['active', 'banned'],
        default: 'active',
    }),
    __metadata("design:type", String)
], UserEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'real_name_verified', default: false }),
    __metadata("design:type", Boolean)
], UserEntity.prototype, "realNameVerified", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], UserEntity.prototype, "level", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ban_reason', length: 512, nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "banReason", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'ban_duration',
        type: 'enum',
        enum: ['permanent', 'temporary'],
        nullable: true,
    }),
    __metadata("design:type", String)
], UserEntity.prototype, "banDuration", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ban_until', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], UserEntity.prototype, "banUntil", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'register_source',
        type: 'enum',
        enum: ['direct', 'invite', 'promotion'],
        default: 'direct',
    }),
    __metadata("design:type", String)
], UserEntity.prototype, "registerSource", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'inviter_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], UserEntity.prototype, "inviterId", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'invite_code', length: 32, nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "inviteCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'needs_tenant_setup', default: false }),
    __metadata("design:type", Boolean)
], UserEntity.prototype, "needsTenantSetup", void 0);
exports.UserEntity = UserEntity = __decorate([
    (0, typeorm_1.Entity)('users')
], UserEntity);
//# sourceMappingURL=user.entity.js.map