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
exports.McpServerEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let McpServerEntity = class McpServerEntity extends base_entity_1.BaseEntity {
    userId;
    name;
    description;
    transportType;
    command;
    args;
    env;
    url;
    headers;
    enabled;
    lastConnectedAt;
    toolCount;
    status;
};
exports.McpServerEntity = McpServerEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], McpServerEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], McpServerEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], McpServerEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'transport_type',
        type: 'enum',
        enum: ['stdio', 'http', 'streamable-http'],
        default: 'stdio',
    }),
    __metadata("design:type", String)
], McpServerEntity.prototype, "transportType", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 256, nullable: true }),
    __metadata("design:type", String)
], McpServerEntity.prototype, "command", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Array)
], McpServerEntity.prototype, "args", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], McpServerEntity.prototype, "env", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], McpServerEntity.prototype, "url", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], McpServerEntity.prototype, "headers", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'enabled', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], McpServerEntity.prototype, "enabled", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_connected_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], McpServerEntity.prototype, "lastConnectedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'tool_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], McpServerEntity.prototype, "toolCount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['pending', 'connected', 'failed', 'disabled'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], McpServerEntity.prototype, "status", void 0);
exports.McpServerEntity = McpServerEntity = __decorate([
    (0, typeorm_1.Entity)('mcp_servers')
], McpServerEntity);
//# sourceMappingURL=mcp-server.entity.js.map