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
exports.AgentImportTaskEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let AgentImportTaskEntity = class AgentImportTaskEntity extends base_entity_1.BaseEntity {
    taskId;
    repoUrl;
    branch;
    commitSha;
    status;
    progress;
    stats;
    error;
};
exports.AgentImportTaskEntity = AgentImportTaskEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'task_id', length: 64 }),
    __metadata("design:type", String)
], AgentImportTaskEntity.prototype, "taskId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'repo_url', length: 512 }),
    __metadata("design:type", String)
], AgentImportTaskEntity.prototype, "repoUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: true }),
    __metadata("design:type", String)
], AgentImportTaskEntity.prototype, "branch", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'commit_sha', length: 64, nullable: true }),
    __metadata("design:type", String)
], AgentImportTaskEntity.prototype, "commitSha", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['pending', 'processing', 'success', 'failed'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], AgentImportTaskEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], AgentImportTaskEntity.prototype, "progress", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], AgentImportTaskEntity.prototype, "stats", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], AgentImportTaskEntity.prototype, "error", void 0);
exports.AgentImportTaskEntity = AgentImportTaskEntity = __decorate([
    (0, typeorm_1.Entity)('agent_import_tasks')
], AgentImportTaskEntity);
//# sourceMappingURL=agent-import-task.entity.js.map