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
exports.StorageBucketEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let StorageBucketEntity = class StorageBucketEntity extends base_entity_1.BaseEntity {
    userId;
    name;
    type;
    config;
    quotaBytes;
    usedBytes;
    status;
};
exports.StorageBucketEntity = StorageBucketEntity;
__decorate([
    (0, typeorm_1.Index)('idx_storage_buckets_user_id'),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], StorageBucketEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], StorageBucketEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['local', 's3', 'oss', 'minio'],
        default: 'local',
    }),
    __metadata("design:type", String)
], StorageBucketEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], StorageBucketEntity.prototype, "config", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'quota_bytes',
        type: 'bigint',
        transformer: base_entity_1.bigintTransformer,
        default: 5368709120,
    }),
    __metadata("design:type", Number)
], StorageBucketEntity.prototype, "quotaBytes", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'used_bytes',
        type: 'bigint',
        transformer: base_entity_1.bigintTransformer,
        default: 0,
    }),
    __metadata("design:type", Number)
], StorageBucketEntity.prototype, "usedBytes", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['active', 'error'],
        default: 'active',
    }),
    __metadata("design:type", String)
], StorageBucketEntity.prototype, "status", void 0);
exports.StorageBucketEntity = StorageBucketEntity = __decorate([
    (0, typeorm_1.Entity)('storage_buckets')
], StorageBucketEntity);
//# sourceMappingURL=storage-bucket.entity.js.map