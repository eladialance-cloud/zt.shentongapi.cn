import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { AdminGuard } from "../admin-auth/admin.guard";
import { AdminCommunityService } from "./admin-community.service";

@ApiTags("社区管理")
@ApiBearerAuth()
@Public()
@Controller("admin/community")
@UseGuards(AdminGuard)
export class AdminCommunityController {
  constructor(private readonly service: AdminCommunityService) {}

  // ===== 帖子审核 =====

  @Get("posts/pending")
  @ApiOperation({ summary: "待审核帖子列表" })
  async listPendingPosts(
    @Query("page", new ParseIntPipe({ optional: true })) page = 1,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize = 20,
  ) {
    return this.service.listPendingPosts(page, pageSize);
  }

  @Post("posts/:id/approve")
  @ApiOperation({ summary: "通过帖子" })
  async approvePost(@Param("id", ParseIntPipe) id: number) {
    return this.service.approvePost(id);
  }

  @Post("posts/:id/reject")
  @ApiOperation({ summary: "拒绝帖子" })
  async rejectPost(
    @Param("id", ParseIntPipe) id: number,
    @Body("reason") reason: string,
  ) {
    return this.service.rejectPost(id, reason || "");
  }

  @Delete("posts/:id")
  @ApiOperation({ summary: "删除帖子" })
  async deletePost(@Param("id", ParseIntPipe) id: number) {
    await this.service.deletePost(id);
    return null;
  }

  @Patch("posts/:id/pin")
  @ApiOperation({ summary: "置顶/取消置顶" })
  async togglePinPost(
    @Param("id", ParseIntPipe) id: number,
    @Body("isPinned") isPinned: boolean,
  ) {
    return this.service.togglePinPost(id, isPinned);
  }

  @Patch("posts/:id/essence")
  @ApiOperation({ summary: "加精/取消加精" })
  async toggleEssencePost(
    @Param("id", ParseIntPipe) id: number,
    @Body("isEssence") isEssence: boolean,
  ) {
    return this.service.toggleEssencePost(id, isEssence);
  }

  // ===== 频道管理 =====

  @Get("channels")
  @ApiOperation({ summary: "频道列表" })
  async listChannels() {
    return this.service.listChannels();
  }

  @Post("channels")
  @ApiOperation({ summary: "创建频道" })
  async createChannel(
    @Body() data: {
      id: string;
      name: string;
      slug: string;
      description?: string;
      icon?: string;
      color?: string;
    },
  ) {
    return this.service.createChannel(data);
  }

  @Put("channels/:id")
  @ApiOperation({ summary: "更新频道" })
  async updateChannel(
    @Param("id") id: string,
    @Body()
    data: Partial<{
      name: string;
      description: string;
      icon: string;
      color: string;
      isEnabled: boolean;
      sortOrder: number;
    }>,
  ) {
    return this.service.updateChannel(id, data);
  }

  @Delete("channels/:id")
  @ApiOperation({ summary: "删除频道" })
  async deleteChannel(@Param("id") id: string) {
    await this.service.deleteChannel(id);
    return null;
  }

  // ===== 标签管理 =====

  @Get("tags")
  @ApiOperation({ summary: "标签列表" })
  async listTags() {
    return this.service.listTags();
  }

  @Delete("tags/:id")
  @ApiOperation({ summary: "删除标签" })
  async deleteTag(@Param("id", ParseIntPipe) id: number) {
    await this.service.deleteTag(id);
    return null;
  }
}
