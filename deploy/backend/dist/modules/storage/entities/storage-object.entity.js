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
exports.StorageObjectEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let StorageObjectEntity = class StorageObjectEntity extends base_entity_1.BaseEntity {
    bucketId;
    userId;
    fileKey;
    filename;
    mimeType;
    size;
    storagePath;
    url;
    metadata;
    deletedAt;
};
exports.StorageObjectEntity = StorageObjectEntity;
__decorate([
    (0, typeorm_1.Index)('idx_storage_objects_bucket_id'),
    (0, typeorm_1.Column)({ name: 'bucket_id', type: 'bigint', transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], StorageObjectEntity.prototype, "bucketId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_storage_objects_user_id'),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], StorageObjectEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_storage_objects_file_key'),
    (0, typeorm_1.Column)({ name: 'file_key', length: 256, unique: true }),
    __metadata("design:type", String)
], StorageObjectEntity.prototype, "fileKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 256 }),
    __metadata("design:type", String)
], StorageObjectEntity.prototype, "filename", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mime_type', length: 128, nullable: true }),
    __metadata("design:type", String)
], StorageObjectEntity.prototype, "mimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], StorageObjectEntity.prototype, "size", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'storage_path', length: 512 }),
    __metadata("design:type", String)
], StorageObjectEntity.prototype, "storagePath", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 1024, nullable: true }),
    __metadata("design:type", String)
], StorageObjectEntity.prototype, "url", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], StorageObjectEntity.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'deleted_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Object)
], StorageObjectEntity.prototype, "deletedAt", void 0);
exports.StorageObjectEntity = StorageObjectEntity = __decorate([
    (0, typeorm_1.Entity)('storage_objects')
], StorageObjectEntity);
//# sourceMappingURL=storage-object.entity.js.map