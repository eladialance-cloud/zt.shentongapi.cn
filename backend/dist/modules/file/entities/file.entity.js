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
exports.FileEntity = void 0;
const typeorm_1 = require("typeorm");
let FileEntity = class FileEntity {
    id;
    userId;
    name;
    path;
    size;
    mimeType;
    storageType;
    createdAt;
};
exports.FileEntity = FileEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], FileEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_files_user_id'),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], FileEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 256 }),
    __metadata("design:type", String)
], FileEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512 }),
    __metadata("design:type", String)
], FileEntity.prototype, "path", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], FileEntity.prototype, "size", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mime_type', length: 128, nullable: true }),
    __metadata("design:type", String)
], FileEntity.prototype, "mimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'storage_type',
        type: 'enum',
        enum: ['minio', 'oss', 'cos'],
    }),
    __metadata("design:type", String)
], FileEntity.prototype, "storageType", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], FileEntity.prototype, "createdAt", void 0);
exports.FileEntity = FileEntity = __decorate([
    (0, typeorm_1.Entity)('files')
], FileEntity);
//# sourceMappingURL=file.entity.js.map