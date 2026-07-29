import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { InviteCodeEntity } from './entities/invite-code.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';

/**
 * 閭€璇风爜鏈嶅姟
 * 鏁版嵁鍚堝悓鐪熸簮锛歍ask 5 - 閭€璇风爜鐢熸垚涓庣鐞嗘湇鍔? *
 * 閭€璇风爜鏍煎紡锛? 瀛楃 base32锛堝ぇ鍐欏瓧姣?+ 鏁板瓧锛屽幓闄ゆ槗娣锋穯瀛楃锛? * 鏈夋晥鏈燂細30 澶? */
@Injectable()
export class InviteCodeService {
  /** base32 瀛楃闆嗭紙鍘婚櫎 0/O/1/I 绛夋槗娣锋穯瀛楃锛?*/
  private static readonly CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  /** 閭€璇风爜闀垮害 */
  private static readonly CODE_LENGTH = 8;
  /** 鏈夋晥鏈燂紙澶╋級 */
  private static readonly EXPIRE_DAYS = 30;

  constructor(
    @InjectRepository(InviteCodeEntity)
    private inviteCodeRepo: Repository<InviteCodeEntity>,
  ) {}

  /**
   * 鐢熸垚閭€璇风爜
   * @param inviterId 閭€璇蜂汉 ID
   * @param expireDays 鏈夋晥鏈熷ぉ鏁帮紙鍙€夛紝鏈紶鍒欎娇鐢ㄩ粯璁?30 澶╋級
   */
  async generateCode(inviterId: number, expireDays?: number): Promise<InviteCodeEntity> {
    const code = await this.generateRandomCode();
    const days = expireDays && expireDays > 0 ? expireDays : InviteCodeService.EXPIRE_DAYS;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const entity = this.inviteCodeRepo.create({
      code,
      inviterId,
      inviteeId: null,
      status: 'active',
      expiresAt,
    });
    return this.inviteCodeRepo.save(entity);
  }

  /**
   * 鏍￠獙閭€璇风爜鏈夋晥鎬э紙涓嶆秷璐癸級
   * @param code 閭€璇风爜
   * @returns 閭€璇风爜瀹炰綋锛堟湁鏁堬級鎴?null锛堟棤鏁堬級
   */
  async validateCode(code: string): Promise<InviteCodeEntity | null> {
    const entity = await this.inviteCodeRepo.findOne({ where: { code } });
    if (!entity) return null;
    if (entity.status !== 'active') return null;
    if (entity.expiresAt.getTime() < Date.now()) return null;
    return entity;
  }

  /**
   * 娑堣垂閭€璇风爜锛堟敞鍐屾垚鍔熷悗璋冪敤锛?   * @param code 閭€璇风爜
   * @param inviteeId 琚個璇蜂汉 ID
   */
  async consumeCode(code: string, inviteeId: number): Promise<void> {
    const entity = await this.inviteCodeRepo.findOne({ where: { code } });
    if (!entity) {
      BusinessException.throw(ErrorCode.INVITE_CODE_INVALID);
    }
    if (entity.status === 'used') {
      BusinessException.throw(ErrorCode.INVITE_CODE_USED);
    }
    if (entity.expiresAt.getTime() < Date.now()) {
      BusinessException.throw(ErrorCode.INVITE_CODE_EXPIRED);
    }
    entity.inviteeId = inviteeId;
    entity.status = 'used';
    await this.inviteCodeRepo.save(entity);
  }

  /**
   * 鏌ヨ鎴戠殑閭€璇风爜鍒楄〃
   * @param inviterId 閭€璇蜂汉 ID
   */
  async listMyCodes(inviterId: number): Promise<InviteCodeEntity[]> {
    return this.inviteCodeRepo.find({
      where: { inviterId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 閭€璇风粺璁?   * @param inviterId 閭€璇蜂汉 ID
   */
  async getInviteStats(
    inviterId: number,
  ): Promise<{ total: number; used: number; active: number }> {
    const list = await this.inviteCodeRepo.find({ where: { inviterId } });
    const used = list.filter((c) => c.status === 'used').length;
    const active = list.filter(
      (c) => c.status === 'active' && c.expiresAt.getTime() > Date.now(),
    ).length;
    return { total: list.length, used, active };
  }

  /** 鐢熸垚闅忔満閭€璇风爜锛堢‘淇濆敮涓€鎬э級 */
  private async generateRandomCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateCodeString();
      const exists = await this.inviteCodeRepo.findOne({ where: { code } });
      if (!exists) return code;
    }
    // 鏋佸皬姒傜巼鍐茬獊锛岀洿鎺ヨ繑鍥烇紙鏁版嵁搴?unique 绾︽潫鍏滃簳锛?    return this.generateCodeString();
  }

  /** 鐢熸垚鍗曚釜閭€璇风爜瀛楃涓?*/
  private generateCodeString(): string {
    const chars = InviteCodeService.CHARSET;
    const bytes = crypto.randomBytes(InviteCodeService.CODE_LENGTH);
    let result = '';
    for (let i = 0; i < InviteCodeService.CODE_LENGTH; i++) {
      result += chars.charAt(bytes[i] % chars.length);
    }
    return result;
  }

  /** 浜嬪姟鍙樹綋锛氬湪 EntityManager 涓婁笅鏂囦腑娑堣垂閭€璇风爜锛堢敤浜庢敞鍐屼簨鍔★級 */
  async consumeCodeWithEntityManager(em: EntityManager, code: string, inviteeId: number): Promise<void> {
    const repo = em.getRepository(InviteCodeEntity);
    const entity = await repo.findOne({ where: { code } });
    if (!entity) {
      BusinessException.throw(ErrorCode.INVITE_CODE_INVALID);
    }
    if (entity.status === 'used') {
      BusinessException.throw(ErrorCode.INVITE_CODE_USED);
    }
    if (entity.expiresAt.getTime() < Date.now()) {
      BusinessException.throw(ErrorCode.INVITE_CODE_EXPIRED);
    }
    entity.inviteeId = inviteeId;
    entity.status = 'used';
    await repo.save(entity);
  }

  /**
   * 鏀寔鎸夌姸鎬佺瓫閫夛紙active/used/revoked/expired锛?   * 娉ㄦ剰锛歟xpired 鏄櫄鎷熺姸鎬侊紙status='active' 涓?expiresAt < now锛夛紝DB 涓笉瀛樺偍
   */
  async listAdminCodes(query: {
    status?: string;
    page: number;
    pageSize: number;
  }): Promise<{
    list: InviteCodeEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const qb = this.inviteCodeRepo.createQueryBuilder('c');

    if (query.status === 'expired') {
      // 杩囨湡锛歴tatus='active' 涓?expiresAt < now
      qb.andWhere('c.status = :status', { status: 'active' });
      qb.andWhere('c.expiresAt < :now', { now: new Date() });
    } else if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }

    qb.orderBy('c.createdAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [list, total] = await qb.getManyAndCount();
    return {
      list,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * 绠＄悊鍛橈細浣滃簾閭€璇风爜锛坰tatus 缃负 'revoked'锛?   * 浠?active 鐘舵€佸彲浣滃簾锛泆sed/expired 涓嶅彲浣滃簾
   */
  async revokeCode(id: number): Promise<void> {
    const entity = await this.inviteCodeRepo.findOne({ where: { id } });
    if (!entity) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '閭€璇风爜涓嶅瓨鍦?);
    }
    if (entity.status !== 'active') {
      BusinessException.throw(
        ErrorCode.VALIDATION_FAILED,
        `閭€璇风爜褰撳墠鐘舵€佷负 ${entity.status}锛屾棤娉曚綔搴焋,
      );
    }
    entity.status = 'revoked';
    await this.inviteCodeRepo.save(entity);
  }
}
