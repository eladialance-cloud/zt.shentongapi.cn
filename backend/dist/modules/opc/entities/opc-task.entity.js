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
exports.OpcTaskEntity = void 0;
const typeorm_1 = require("typeorm");
let OpcTaskEntity = class OpcTaskEntity {
    id;
    teamId;
    title;
    description;
    status;
    assigneeId;
    creatorId;
    priority;
    dueDate;
    createdAt;
};
exports.OpcTaskEntity = OpcTaskEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], OpcTaskEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_opc_tasks_team_id'),
    (0, typeorm_1.Column)({ name: 'team_id', type: 'bigint' }),
    __metadata("design:type", Number)
], OpcTaskEntity.prototype, "teamId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], OpcTaskEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], OpcTaskEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['pending', 'in_progress', 'completed'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], OpcTaskEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'assignee_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], OpcTaskEntity.prototype, "assigneeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'creator_id', type: 'bigint' }),
    __metadata("design:type", Number)
], OpcTaskEntity.prototype, "creatorId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['low', 'medium', 'high'],
        default: 'medium',
    }),
    __metadata("design:type", String)
], OpcTaskEntity.prototype, "priority", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'due_date', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], OpcTaskEntity.prototype, "dueDate", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], OpcTaskEntity.prototype, "createdAt", void 0);
exports.OpcTaskEntity = OpcTaskEntity = __decorate([
    (0, typeorm_1.Entity)('opc_tasks')
], OpcTaskEntity);
//# sourceMappingURL=opc-task.entity.js.map