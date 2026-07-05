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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var InviteCodeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteCodeService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const invite_code_entity_1 = require("./entities/invite-code.entity");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
let InviteCodeService = class InviteCodeService {
    static { InviteCodeService_1 = this; }
    inviteCodeRepo;
    static CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    static CODE_LENGTH = 8;
    static EXPIRE_DAYS = 30;
    constructor(inviteCodeRepo) {
        this.inviteCodeRepo = inviteCodeRepo;
    }
    async generateCode(inviterId) {
        const code = await this.generateRandomCode();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + InviteCodeService_1.EXPIRE_DAYS);
        const entity = this.inviteCodeRepo.create({
            code,
            inviterId,
            inviteeId: null,
            status: 'active',
            expiresAt,
        });
        return this.inviteCodeRepo.save(entity);
    }
    async validateCode(code) {
        const entity = await this.inviteCodeRepo.findOne({ where: { code } });
        if (!entity)
            return null;
        if (entity.status !== 'active')
            return null;
        if (entity.expiresAt.getTime() < Date.now())
            return null;
        return entity;
    }
    async consumeCode(code, inviteeId) {
        const entity = await this.inviteCodeRepo.findOne({ where: { code } });
        if (!entity) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INVITE_CODE_INVALID);
        }
        if (entity.status === 'used') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INVITE_CODE_USED);
        }
        if (entity.expiresAt.getTime() < Date.now()) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INVITE_CODE_EXPIRED);
        }
        entity.inviteeId = inviteeId;
        entity.status = 'used';
        await this.inviteCodeRepo.save(entity);
    }
    async listMyCodes(inviterId) {
        return this.inviteCodeRepo.find({
            where: { inviterId },
            order: { createdAt: 'DESC' },
        });
    }
    async getInviteStats(inviterId) {
        const list = await this.inviteCodeRepo.find({ where: { inviterId } });
        const used = list.filter((c) => c.status === 'used').length;
        const active = list.filter((c) => c.status === 'active' && c.expiresAt.getTime() > Date.now()).length;
        return { total: list.length, used, active };
    }
    async generateRandomCode() {
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = this.generateCodeString();
            const exists = await this.inviteCodeRepo.findOne({ where: { code } });
            if (!exists)
                return code;
        }
        return this.generateCodeString();
    }
    generateCodeString() {
        const chars = InviteCodeService_1.CHARSET;
        let result = '';
        for (let i = 0; i < InviteCodeService_1.CODE_LENGTH; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
};
exports.InviteCodeService = InviteCodeService;
exports.InviteCodeService = InviteCodeService = InviteCodeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(invite_code_entity_1.InviteCodeEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], InviteCodeService);
//# sourceMappingURL=invite-code.service.js.map