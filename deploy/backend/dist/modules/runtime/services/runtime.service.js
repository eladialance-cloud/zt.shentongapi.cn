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
var RuntimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const runtime_version_entity_1 = require("../entities/runtime-version.entity");
let RuntimeService = RuntimeService_1 = class RuntimeService {
    runtimeRepo;
    logger = new common_1.Logger(RuntimeService_1.name);
    constructor(runtimeRepo) {
        this.runtimeRepo = runtimeRepo;
    }
    async checkUpdate(platform) {
        const rows = await this.runtimeRepo.find({
            where: { isActive: true, platform },
            order: { createdAt: 'DESC' },
        });
        const latestByService = new Map();
        for (const row of rows) {
            if (!latestByService.has(row.serviceName)) {
                latestByService.set(row.serviceName, row);
            }
        }
        const toInfo = (e) => {
            if (!e)
                return null;
            return {
                version: e.version,
                downloadUrl: e.downloadUrl,
                sha256: e.sha256,
                changelog: e.changelog ?? null,
                forceUpdate: e.forceUpdate,
                minAppVersion: e.minAppVersion ?? null,
            };
        };
        return {
            openclaw: toInfo(latestByService.get('openclaw')),
            n8n: toInfo(latestByService.get('n8n')),
            mcp: toInfo(latestByService.get('mcp')),
        };
    }
    health() {
        return { status: 'ok', module: 'runtime' };
    }
};
exports.RuntimeService = RuntimeService;
exports.RuntimeService = RuntimeService = RuntimeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(runtime_version_entity_1.RuntimeVersionEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], RuntimeService);
//# sourceMappingURL=runtime.service.js.map