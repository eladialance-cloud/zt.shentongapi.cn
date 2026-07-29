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
exports.PluginService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const plugin_entity_1 = require("../entities/plugin.entity");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
let PluginService = class PluginService {
    pluginRepo;
    constructor(pluginRepo) {
        this.pluginRepo = pluginRepo;
    }
    async list(page = 1, pageSize = 20, type) {
        const qb = this.pluginRepo
            .createQueryBuilder('p')
            .where('p.is_active = :active', { active: true })
            .andWhere('p.review_status = :status', { status: 'approved' });
        if (type) {
            qb.andWhere('p.type = :type', { type });
        }
        qb.orderBy('p.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [list, total] = await qb.getManyAndCount();
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async detail(id) {
        const plugin = await this.pluginRepo.findOne({
            where: { id, isActive: true, reviewStatus: 'approved' },
        });
        if (!plugin) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `插件 ${id} 不存在或未通过审核`);
        }
        return plugin;
    }
    health() {
        return { status: 'ok', module: 'plugin' };
    }
};
exports.PluginService = PluginService;
exports.PluginService = PluginService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(plugin_entity_1.PluginEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PluginService);
//# sourceMappingURL=plugin.service.js.map