import { IsIn, IsInt, Min } from 'class-validator';
import { MarketItemType } from '../entities/purchased-item.entity';

export class PurchaseDto {
  @IsIn(['skill', 'plugin', 'workflow', 'agent', 'mcp'])
  type: MarketItemType;

  @IsInt()
  @Min(1)
  itemId: number;
}
