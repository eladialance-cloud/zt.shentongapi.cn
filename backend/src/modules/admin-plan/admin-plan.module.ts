import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MembershipPlanEntity } from "../payment/entities/membership-plan.entity";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminPlanController } from "./admin-plan.controller";
import { AdminPlanService } from "./admin-plan.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([MembershipPlanEntity]),
    AdminAuthModule,
  ],
  controllers: [AdminPlanController],
  providers: [AdminPlanService],
  exports: [AdminPlanService],
})
export class AdminPlanModule {}
