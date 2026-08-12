/** @Public() 跳过 JwtAuthGuard，由 AdminGuard 使用独立 ADMIN_JWT_SECRET 校验。双 JWT 隔离模式：用户端与管理端认证互不干扰。 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { BigIntParsePipe } from '../../common/pipes/bigint-parse.pipe';
import { AdminSkillStoreService } from './admin-skill-store.service';
import { CreateSkillSourceDto, SkillSourceQueryDto, UpdateSkillSourceDto } from './dto/skill-source.dto';
import { UploadSkillSourceDto } from './dto/upload-skill-source.dto';
import { BatchDeleteDto } from '../../common/dto/batch-delete.dto';
import { UpdateSkillPackageDto, SkillPackageQueryDto, RejectSkillPackageDto } from './dto/skill-package.dto';

@ApiTags('管理端-技能商店')
@ApiBearerAuth()
@Controller('admin/skill-store')
@Public()
@UseGuards(AdminGuard)
export class AdminSkillStoreController {
  constructor(
    private readonly service: AdminSkillStoreService,
  ) {}

  // ===== 技能源管理 =====

  @Post('sources')
  @ApiOperation({ summary: '提交技能源' })
  async createSource(@Body() dto: CreateSkillSourceDto) {
    return this.service.createSource(dto);
  }
  @Post('sources/upload')
  @ApiOperation({ summary: '本地上传 zip 技能源' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        skillName: { type: 'string' },
        skillDesc: { type: 'string' },
        skillType: { type: 'string', enum: ['skill', 'workflow'] },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async uploadSource(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadSkillSourceDto,
  ) {
    if (!file) {
      throw new BadRequestException('请上传 zip 文件');
    }
    return this.service.createSourceFromZip(file, dto);
  }


  @Get('sources')
  @ApiOperation({ summary: '技能源列表' })
  async listSources(@Query() query: SkillSourceQueryDto) {
    return this.service.listSources(query);
  }

  @Post('sources/:id/analyze')
  @ApiOperation({ summary: '触发解析' })
  async analyze(@Param('id', BigIntParsePipe) id: number) {
    return this.service.triggerAnalyze(id);
  }

  @Patch('sources/:id')
  @ApiOperation({ summary: '编辑技能源' })
  async updateSource(@Param('id', BigIntParsePipe) id: number, @Body() dto: UpdateSkillSourceDto) {
    return this.service.updateSource(id, dto);
  }

  @Post('sources/batch-delete')
  @ApiOperation({ summary: '批量删除技能源' })
  async batchDeleteSources(@Body() dto: BatchDeleteDto) {
    return this.service.batchDeleteSources(dto.ids);
  }

  @Delete('sources/:id')
  @ApiOperation({ summary: '删除技能源' })
  async removeSource(@Param('id', BigIntParsePipe) id: number) {
    await this.service.removeSource(id);
    return null;
  }

  // ===== 技能包管理 =====

  @Get('packages')
  @ApiOperation({ summary: '技能包列表' })
  async listPackages(@Query() query: SkillPackageQueryDto) {
    return this.service.listPackages(query);
  }

  @Post('packages/batch-delete')
  @ApiOperation({ summary: '批量删除技能包' })
  async batchDeletePackages(@Body() dto: BatchDeleteDto) {
    return this.service.batchDeletePackages(dto.ids);
  }

  @ApiOperation({ summary: '技能包详情' })
  async packageDetail(@Param('id', BigIntParsePipe) id: number) {
    return this.service.packageDetail(id);
  }

  @Patch('packages/:id')
  @ApiOperation({ summary: '编辑技能包' })
  async updatePackage(@Param('id', BigIntParsePipe) id: number, @Body() dto: UpdateSkillPackageDto) {
    await this.service.updatePackage(id, dto);
    return null;
  }

  @Post('packages/:id/submit-review')
  @ApiOperation({ summary: '提交审核' })
  async submitReview(@Param('id', BigIntParsePipe) id: number) {
    await this.service.submitReview(id);
    return null;
  }

  @Post('packages/:id/approve')
  @ApiOperation({ summary: '审核通过' })
  async approve(@Param('id', BigIntParsePipe) id: number) {
    await this.service.approve(id);
    return null;
  }

  @Post('packages/:id/reject')
  @ApiOperation({ summary: '审核驳回' })
  async reject(@Param('id', BigIntParsePipe) id: number, @Body() dto: RejectSkillPackageDto) {
    await this.service.reject(id, dto.reason);
    return null;
  }

  @Post('packages/:id/publish')
  @ApiOperation({ summary: '上架' })
  async publish(@Param('id', BigIntParsePipe) id: number) {
    await this.service.publish(id);
    return null;
  }

  @Post('packages/:id/unpublish')
  @ApiOperation({ summary: '下架' })
  async unpublish(@Param('id', BigIntParsePipe) id: number) {
    await this.service.unpublish(id);
    return null;
  }

  @Delete('packages/:id')
  @ApiOperation({ summary: '删除技能包' })
  async removePackage(@Param('id', BigIntParsePipe) id: number) {
    await this.service.removePackage(id);
    return null;
  }

  @Post('packages/:id/health-check')
  @ApiOperation({ summary: '健康检查' })
  async healthCheck(@Param('id', BigIntParsePipe) id: number) {
    return this.service.healthCheck(id);
  }
}
