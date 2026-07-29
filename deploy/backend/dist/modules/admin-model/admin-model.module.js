"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminModelModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const model_entity_1 = require("../model/entities/model.entity");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const common_module_1 = require("../../common/common.module");
const admin_model_controller_1 = require("./admin-model.controller");
const admin_model_service_1 = require("./admin-model.service");
let AdminModelModule = class AdminModelModule {
};
exports.AdminModelModule = AdminModelModule;
exports.AdminModelModule = AdminModelModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([model_entity_1.ModelEntity]), admin_auth_module_1.AdminAuthModule, common_module_1.CommonModule],
        controllers: [admin_model_controller_1.AdminModelController],
        providers: [admin_model_service_1.AdminModelService],
        exports: [admin_model_service_1.AdminModelService],
    })
], AdminModelModule);
//# sourceMappingURL=admin-model.module.js.map