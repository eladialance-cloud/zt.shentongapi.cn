// Hermes 技能包市场
// SubTask 13.3 + 13.4: 技能包市场列表 + 安装 + 已安装标记 + 费用预估
// 调用 GET /hermes/skills/market、POST /hermes/skills/:skillId/install、GET /hermes/skills/installed

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Empty,
  InputNumber,
  Modal,
  Spin,
  Tag,
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  ThunderboltOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  DownloadOutlined
} from '@ant-design/icons'
import * as hermesApi from '@/api/hermes-api'
import type { HermesSkill, InstalledSkill } from '@/types/hermes'
import styles from './styles.module.css'

export default function HermesSkillMarket() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [skills, setSkills] = useState<HermesSkill[]>([])
  const [installedIds, setInstalledIds] = useState<Set<number>>(new Set())
  const [installing, setInstalling] = useState<Record<number, boolean>>({})
  const [estimateSkill, setEstimateSkill] = useState<HermesSkill | null>(null)
  const [estimateMinutes, setEstimateMinutes] = useState<number>(5)

  /** 加载技能包市场 + 已安装列表 */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [market, installed] = await Promise.all([
        hermesApi.listSkillMarket(),
        hermesApi.listInstalledSkills()
      ])
      const installedIdSet = new Set(installed.map((s: InstalledSkill) => s.id))
      setInstalledIds(installedIdSet)
      // 标记已安装状态
      setSkills(
        (market || []).map((s) => ({
          ...s,
          isInstalled: installedIdSet.has(s.id)
        }))
      )
    } catch (err) {
      console.error('[HermesSkillMarket] load failed:', err)
      message.error('加载技能包市场失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 安装技能包 */
  const handleInstall = async (skill: HermesSkill) => {
    setInstalling((prev) => ({ ...prev, [skill.id]: true }))
    try {
      await hermesApi.installSkill(skill.id)
      message.success(`技能包 "${skill.name}" 安装成功`)
      setInstalledIds((prev) => new Set(prev).add(skill.id))
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, isInstalled: true } : s))
      )
    } catch (err) {
      console.error('[HermesSkillMarket] install failed:', err)
      message.error('安装失败: ' + (err as Error).message)
    } finally {
      setInstalling((prev) => ({ ...prev, [skill.id]: false }))
    }
  }

  /** 打开费用预估弹窗 */
  const handleOpenEstimate = (skill: HermesSkill) => {
    setEstimateSkill(skill)
    setEstimateMinutes(5)
  }

  /** 计算预估费用 */
  const estimateCost = (skill: HermesSkill, minutes: number): number => {
    return skill.pricePerMinute * minutes
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <ShopOutlined />
          <span>技能包市场</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/hermes')}
          >
            返回实例列表
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {skills.length === 0 && !loading ? (
          <Empty description="暂无可用技能包" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.skillGrid}>
            {skills.map((skill) => (
              <Card key={skill.id} className={styles.skillCard} bordered={false}>
                <div className={styles.skillCardBody}>
                  <div className={styles.skillHeader}>
                    <div className={styles.skillName}>
                      <div className={styles.skillIcon}>
                        <ThunderboltOutlined />
                      </div>
                      <span>{skill.name}</span>
                    </div>
                    {skill.isInstalled && (
                      <Tag className={styles.installedTag}>
                        <CheckCircleOutlined style={{ marginRight: 4 }} />
                        已安装
                      </Tag>
                    )}
                  </div>

                  <div className={styles.skillDesc}>
                    {skill.description || '暂无描述'}
                  </div>

                  <div className={styles.skillMeta}>
                    <span className={styles.skillAuthor}>
                      作者：{skill.author}
                    </span>
                    <span>安装 {skill.installCount.toLocaleString()} 次</span>
                  </div>

                  <div className={styles.skillMeta}>
                    <span
                      className={
                        skill.pricePerMinute === 0
                          ? styles.skillPriceFree
                          : styles.skillPrice
                      }
                    >
                      {skill.pricePerMinute === 0
                        ? '免费'
                        : `${skill.pricePerMinute} 积分/分钟`}
                    </span>
                    {skill.version && (
                      <span style={{ color: '#6e7681' }}>v{skill.version}</span>
                    )}
                  </div>

                  <div className={styles.skillActions}>
                    {skill.isInstalled ? (
                      <Button disabled icon={<CheckCircleOutlined />}>
                        已安装
                      </Button>
                    ) : (
                      <Button
                        type="primary"
                        className={styles.primaryBtn}
                        icon={<DownloadOutlined />}
                        loading={!!installing[skill.id]}
                        onClick={() => handleInstall(skill)}
                      >
                        安装
                      </Button>
                    )}
                    {skill.pricePerMinute > 0 && (
                      <Button
                        className={styles.backBtn}
                        onClick={() => handleOpenEstimate(skill)}
                      >
                        费用预估
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>

      {/* 费用预估弹窗 */}
      <Modal
        title="费用预估"
        open={!!estimateSkill}
        onOk={() => setEstimateSkill(null)}
        onCancel={() => setEstimateSkill(null)}
        okText="关闭"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {estimateSkill && (
          <div>
            <p style={{ color: '#a5b4fc', marginBottom: 12 }}>
              技能包：{estimateSkill.name}
            </p>
            <p style={{ color: '#94a3b8', marginBottom: 8 }}>
              单价：{estimateSkill.pricePerMinute} 积分/分钟
            </p>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: '#94a3b8', marginRight: 8 }}>
                预计时长（分钟）：
              </span>
              <InputNumber
                min={1}
                max={1440}
                value={estimateMinutes}
                onChange={(v) => setEstimateMinutes(Number(v) || 1)}
              />
            </div>
            <div className={styles.costEstimate}>
              <ThunderboltOutlined />
              <span>
                预估费用：
                <strong style={{ marginLeft: 4 }}>
                  {estimateCost(estimateSkill, estimateMinutes).toLocaleString()}
                </strong>{' '}
                积分
              </span>
            </div>
            <p
              style={{
                color: '#6e7681',
                fontSize: 11,
                marginTop: 8,
                lineHeight: 1.5
              }}
            >
              注：实际费用由后端 HermesBillingService 按实际执行时长计算，
              最终积分消耗可能在任务历史中查看。
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
