"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const common_module_1 = require("../../common/common.module");
const mcp_server_entity_1 = require("./entities/mcp-server.entity");
const mcp_controller_1 = require("./controllers/mcp.controller");
const mcp_service_1 = require("./services/mcp.service");
let McpModule = class McpModule {
};
exports.McpModule = McpModule;
exports.McpModule = McpModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([mcp_server_entity_1.McpServerEntity]),
            common_module_1.CommonModule,
        ],
        controllers: [mcp_controller_1.McpController],
        providers: [mcp_service_1.McpService],
        exports: [mcp_service_1.McpService],
    })
], McpModule);
//# sourceMappingURL=mcp.module.js.map