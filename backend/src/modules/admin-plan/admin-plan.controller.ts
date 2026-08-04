import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { AdminGuard } from "../admin-auth/admin.guard";
import { AdminPlanService } from "./admin-plan.service";

@ApiTags("套餐管理")
@ApiBearerAuth()
@Public()
@Controller("admin/plans")
@UseGuards(AdminGuard)
export class AdminPlanController {
  constructor(private readonly service: AdminPlanService) {}

  @Get()
  @ApiOperation({ summary: "套餐列表" })
  async list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: "新增套餐" })
  async create(
    @Body()
    dto: {
      name: string;
      description?: string;
      price: number;
      credits: number;
      durationDays: number;
      level?: number;
      period?: string;
      benefits?: string[];
      features?: string[];
      isActive?: boolean;
    },
  ) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "编辑套餐" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    dto: Partial<{
      name: string;
      description: string;
      price: number;
      credits: number;
      durationDays: number;
      level: number;
      period: string;
      benefits: string[];
      features: string[];
      isActive: boolean;
    }>,
  ) {
    await this.service.update(id, dto);
    return null;
  }

  @Delete(":id")
  @ApiOperation({ summary: "删除套餐" })
  async delete(@Param("id", ParseIntPipe) id: number) {
    await this.service.delete(id);
    return null;
  }
}
