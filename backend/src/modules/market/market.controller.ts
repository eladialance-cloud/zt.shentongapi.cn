import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ICurrentUser } from '../../common/decorators/current-user.decorator';
import { MarketService } from './market.service';
import { PurchaseDto } from './dto/purchase.dto';
import { MarketItemType } from './entities/purchased-item.entity';

@ApiTags('内容市场')
@ApiBearerAuth()
@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Post('purchase')
  @ApiOperation({ summary: '购买官方内容（扣积分，幂等）' })
  purchase(@CurrentUser() user: ICurrentUser, @Body() dto: PurchaseDto) {
    return this.marketService.purchase(user.userId, dto.type, dto.itemId);
  }

  @Get('purchased')
  @ApiOperation({ summary: '已购清单（换机重下）' })
  listPurchased(@CurrentUser() user: ICurrentUser) {
    return this.marketService.listPurchased(user.userId);
  }

  @Get('items/:type/:id/download')
  @ApiOperation({ summary: '下载安装包（已购或免费）' })
  download(
    @CurrentUser() user: ICurrentUser,
    @Param('type') type: MarketItemType,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketService.getDownloadPackage(user.userId, type, id);
  }
}
