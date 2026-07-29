"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const user_entity_1 = require("../user/entities/user.entity");
const role_entity_1 = require("../user/entities/role.entity");
const user_role_entity_1 = require("../user/entities/user-role.entity");
const common_module_1 = require("../../common/common.module");
const admin_auth_controller_1 = require("./admin-auth.controller");
const admin_auth_service_1 = require("./admin-auth.service");
const admin_auth_strategy_1 = require("./admin-auth.strategy");
const admin_guard_1 = require("./admin.guard");
let AdminAuthModule = class AdminAuthModule {
};
exports.AdminAuthModule = AdminAuthModule;
exports.AdminAuthModule = AdminAuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            passport_1.PassportModule,
            jwt_1.JwtModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: config.get('ADMIN_JWT_SECRET'),
                    signOptions: {
                        expiresIn: config.get('ADMIN_JWT_EXPIRES_IN', '8h'),
                    },
                }),
            }),
            typeorm_1.TypeOrmModule.forFeature([user_entity_1.UserEntity, role_entity_1.RoleEntity, user_role_entity_1.UserRoleEntity]),
            common_module_1.CommonModule,
        ],
        controllers: [admin_auth_controller_1.AdminAuthController],
        providers: [admin_auth_service_1.AdminAuthService, admin_auth_strategy_1.AdminAuthStrategy, admin_guard_1.AdminGuard],
        exports: [admin_guard_1.AdminGuard, admin_auth_service_1.AdminAuthService, jwt_1.JwtModule],
    })
], AdminAuthModule);
//# sourceMappingURL=admin-auth.module.js.map