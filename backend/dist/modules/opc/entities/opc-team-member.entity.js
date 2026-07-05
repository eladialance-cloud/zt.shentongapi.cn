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
exports.OpcTeamMemberEntity = void 0;
const typeorm_1 = require("typeorm");
let OpcTeamMemberEntity = class OpcTeamMemberEntity {
    id;
    teamId;
    userId;
    role;
    joinedAt;
};
exports.OpcTeamMemberEntity = OpcTeamMemberEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], OpcTeamMemberEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_opc_team_members_team_id'),
    (0, typeorm_1.Column)({ name: 'team_id', type: 'bigint' }),
    __metadata("design:type", Number)
], OpcTeamMemberEntity.prototype, "teamId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_opc_team_members_user_id'),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], OpcTeamMemberEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: ['owner', 'admin', 'member'] }),
    __metadata("design:type", String)
], OpcTeamMemberEntity.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'joined_at' }),
    __metadata("design:type", Date)
], OpcTeamMemberEntity.prototype, "joinedAt", void 0);
exports.OpcTeamMemberEntity = OpcTeamMemberEntity = __decorate([
    (0, typeorm_1.Entity)('opc_team_members'),
    (0, typeorm_1.Index)('uniq_opc_team_members', ['teamId', 'userId'], { unique: true })
], OpcTeamMemberEntity);
//# sourceMappingURL=opc-team-member.entity.js.map