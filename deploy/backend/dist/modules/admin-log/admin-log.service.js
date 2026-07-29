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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminLogService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const operation_log_entity_1 = require("./operation-log.entity");
let AdminLogService = class AdminLogService {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async list(query) {
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const qb = this.repo.createQueryBuilder('l');
        if (query.userId) {
            qb.andWhere('l.user_id = :userId', { userId: query.userId });
        }
        if (query.type) {
            qb.andWhere('l.type = :type', { type: query.type });
        }
        if (query.startTime) {
            qb.andWhere('l.created_at >= :start', { start: query.startTime });
        }
        if (query.endTime) {
            qb.andWhere('l.created_at <= :end', { end: query.endTime });
        }
        qb.orderBy('l.created_at', 'DESC');
        const [list, total] = await qb
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async record(data) {
        try {
            await this.repo.insert(data);
        }
        catch {
        }
    }
};
exports.AdminLogService = AdminLogService;
exports.AdminLogService = AdminLogService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(operation_log_entity_1.OperationLogEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AdminLogService);
//# sourceMappingURL=admin-log.service.js.map