"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyPoolModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const api_key_pool_entity_1 = require("./entities/api-key-pool.entity");
const api_key_pool_service_1 = require("./services/api-key-pool.service");
const api_key_pool_controller_1 = require("./api-key-pool.controller");
const common_module_1 = require("../../common/common.module");
let ApiKeyPoolModule = class ApiKeyPoolModule {
};
exports.ApiKeyPoolModule = ApiKeyPoolModule;
exports.ApiKeyPoolModule = ApiKeyPoolModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([api_key_pool_entity_1.ApiKeyPoolEntity]),
            common_module_1.CommonModule,
        ],
        controllers: [api_key_pool_controller_1.ApiKeyPoolController],
        providers: [api_key_pool_service_1.ApiKeyPoolService],
        exports: [api_key_pool_service_1.ApiKeyPoolService],
    })
], ApiKeyPoolModule);
//# sourceMappingURL=api-key-pool.module.js.map