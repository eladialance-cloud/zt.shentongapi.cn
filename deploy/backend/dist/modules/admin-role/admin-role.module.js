"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminRoleModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const role_entity_1 = require("../user/entities/role.entity");
const user_role_entity_1 = require("../user/entities/user-role.entity");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const admin_role_controller_1 = require("./admin-role.controller");
const admin_role_service_1 = require("./admin-role.service");
let AdminRoleModule = class AdminRoleModule {
};
exports.AdminRoleModule = AdminRoleModule;
exports.AdminRoleModule = AdminRoleModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([role_entity_1.RoleEntity, user_role_entity_1.UserRoleEntity]),
            admin_auth_module_1.AdminAuthModule,
        ],
        controllers: [admin_role_controller_1.AdminRoleController],
        providers: [admin_role_service_1.AdminRoleService],
        exports: [admin_role_service_1.AdminRoleService],
    })
], AdminRoleModule);
//# sourceMappingURL=admin-role.module.js.map