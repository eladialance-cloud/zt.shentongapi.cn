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
exports.FileService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const file_entity_1 = require("../entities/file.entity");
let FileService = class FileService {
    fileRepo;
    constructor(fileRepo) {
        this.fileRepo = fileRepo;
    }
    health() {
        return { status: 'ok', module: 'file' };
    }
    async upload(userId, file) {
        const entity = this.fileRepo.create({
            userId,
            name: file.originalname,
            path: file.path,
            size: file.size,
            mimeType: file.mimetype,
            storageType: 'minio',
        });
        return this.fileRepo.save(entity);
    }
    async list(userId, page = 1, pageSize = 20) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const [list, total] = await this.fileRepo.findAndCount({
            where: { userId },
            order: { createdAt: 'DESC' },
            skip: (p - 1) * ps,
            take: ps,
        });
        return {
            list,
            total,
            page: p,
            pageSize: ps,
            totalPages: Math.ceil(total / ps) || 0,
        };
    }
    async remove(id, userId) {
        const file = await this.fileRepo.findOne({ where: { id, userId } });
        if (!file) {
            throw new common_1.NotFoundException(`文件 ${id} 不存在`);
        }
        await this.fileRepo.remove(file);
    }
};
exports.FileService = FileService;
exports.FileService = FileService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(file_entity_1.FileEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], FileService);
//# sourceMappingURL=file.service.js.map