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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { IndustryService } from './industry.service';

@ApiTags('行业分类')
@ApiBearerAuth()
@Public()
@Controller('admin/industries')
@UseGuards(AdminGuard)
export class AdminIndustryController {
  constructor(private readonly service: IndustryService) {}

  @Get()
  @ApiOperation({ summary: '行业分类列表' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: '新增行业分类' })
  create(@Body() dto: { name: string; sortOrder?: number }) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑行业分类' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; sortOrder?: number },
  ) {
    await this.service.update(id, dto);
    return null;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除行业分类' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return null;
  }
}
