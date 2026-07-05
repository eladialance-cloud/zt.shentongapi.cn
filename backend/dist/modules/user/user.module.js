"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const user_entity_1 = require("./entities/user.entity");
const role_entity_1 = require("./entities/role.entity");
const user_role_entity_1 = require("./entities/user-role.entity");
const team_entity_1 = require("./entities/team.entity");
const team_member_entity_1 = require("./entities/team-member.entity");
const invite_code_entity_1 = require("./entities/invite-code.entity");
const user_controller_1 = require("./controllers/user.controller");
const user_service_1 = require("./services/user.service");
const invite_code_service_1 = require("./invite-code.service");
const common_module_1 = require("../../common/common.module");
let UserModule = class UserModule {
};
exports.UserModule = UserModule;
exports.UserModule = UserModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                user_entity_1.UserEntity,
                role_entity_1.RoleEntity,
                user_role_entity_1.UserRoleEntity,
                team_entity_1.TeamEntity,
                team_member_entity_1.TeamMemberEntity,
                invite_code_entity_1.InviteCodeEntity,
            ]),
            common_module_1.CommonModule,
        ],
        controllers: [user_controller_1.UserController],
        providers: [user_service_1.UserService, invite_code_service_1.InviteCodeService],
        exports: [user_service_1.UserService, invite_code_service_1.InviteCodeService],
    })
], UserModule);
//# sourceMappingURL=user.module.js.map