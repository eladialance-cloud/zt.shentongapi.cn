"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const plugin_entity_1 = require("./entities/plugin.entity");
const plugin_controller_1 = require("./controllers/plugin.controller");
const plugin_service_1 = require("./services/plugin.service");
let PluginModule = class PluginModule {
};
exports.PluginModule = PluginModule;
exports.PluginModule = PluginModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([plugin_entity_1.PluginEntity])],
        controllers: [plugin_controller_1.PluginController],
        providers: [plugin_service_1.PluginService],
        exports: [plugin_service_1.PluginService],
    })
], PluginModule);
//# sourceMappingURL=plugin.module.js.map