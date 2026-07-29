"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminPluginModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const plugin_entity_1 = require("../plugin/entities/plugin.entity");
const admin_plugin_controller_1 = require("./admin-plugin.controller");
const admin_plugin_service_1 = require("./admin-plugin.service");
let AdminPluginModule = class AdminPluginModule {
};
exports.AdminPluginModule = AdminPluginModule;
exports.AdminPluginModule = AdminPluginModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([plugin_entity_1.PluginEntity]), admin_auth_module_1.AdminAuthModule],
        controllers: [admin_plugin_controller_1.AdminPluginController],
        providers: [admin_plugin_service_1.AdminPluginService],
        exports: [admin_plugin_service_1.AdminPluginService],
    })
], AdminPluginModule);
//# sourceMappingURL=admin-plugin.module.js.map