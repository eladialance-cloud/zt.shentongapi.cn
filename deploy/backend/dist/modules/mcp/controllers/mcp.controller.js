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
exports.McpController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const mcp_service_1 = require("../services/mcp.service");
let McpController = class McpController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
    listServers(user) {
        return this.service.listServers(user.userId);
    }
    createServer(user, body) {
        return this.service.createServer(user.userId, body);
    }
    getServer(user, serverId) {
        return this.service.listServers(user.userId).then((servers) => {
            const id = Number(serverId);
            const found = servers.find((s) => s.id === id);
            if (!found) {
                throw new common_1.HttpException('MCP Server 不存在', common_1.HttpStatus.NOT_FOUND);
            }
            return found;
        });
    }
    updateServer(user, serverId, body) {
        return this.service.updateServer(user.userId, serverId, body);
    }
    deleteServer(user, serverId) {
        return this.service.deleteServer(user.userId, serverId);
    }
    listTools(user, serverId) {
        return this.service.listTools(user.userId, serverId);
    }
    callTool(user, body) {
        return this.service.callTool(user.userId, body);
    }
    probeServer(user, serverId) {
        return this.service.probeServer(user.userId, serverId);
    }
};
exports.McpController = McpController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], McpController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('servers'),
    (0, swagger_1.ApiOperation)({ summary: '获取 MCP 服务器列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], McpController.prototype, "listServers", null);
__decorate([
    (0, common_1.Post)('servers'),
    (0, swagger_1.ApiOperation)({ summary: '创建 MCP 服务器配置' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], McpController.prototype, "createServer", null);
__decorate([
    (0, common_1.Get)('servers/:serverId'),
    (0, swagger_1.ApiOperation)({ summary: '获取 MCP 服务器详情' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('serverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], McpController.prototype, "getServer", null);
__decorate([
    (0, common_1.Put)('servers/:serverId'),
    (0, swagger_1.ApiOperation)({ summary: '更新 MCP 服务器配置' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('serverId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], McpController.prototype, "updateServer", null);
__decorate([
    (0, common_1.Delete)('servers/:serverId'),
    (0, swagger_1.ApiOperation)({ summary: '删除 MCP 服务器配置' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('serverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], McpController.prototype, "deleteServer", null);
__decorate([
    (0, common_1.Get)('servers/:serverId/tools'),
    (0, swagger_1.ApiOperation)({ summary: '获取指定服务器的工具列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('serverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], McpController.prototype, "listTools", null);
__decorate([
    (0, common_1.Post)('call'),
    (0, swagger_1.ApiOperation)({ summary: '调用 MCP 工具' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], McpController.prototype, "callTool", null);
__decorate([
    (0, common_1.Post)('servers/:serverId/probe'),
    (0, swagger_1.ApiOperation)({ summary: '测试 MCP 服务器连接' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('serverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], McpController.prototype, "probeServer", null);
exports.McpController = McpController = __decorate([
    (0, swagger_1.ApiTags)('MCP'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('mcp'),
    __metadata("design:paramtypes", [mcp_service_1.McpService])
], McpController);
//# sourceMappingURL=mcp.controller.js.map