// 开源技能库 - 技能源（GitHub 技能目录清单）
// 数据：GET /skill-sources（用户端技能源 API）
// 下载：用户本机直连 GitHub（主进程 market:installGithubSkill 下载 tar.gz → 解压 → 登记本地清单）

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  Pagination,
  Select,
  Spin,
  Tag,
  message,
} from "antd";
import {
  DownloadOutlined,
  GithubOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import * as marketApi from "@/api/market-api";
import type { UserSkillSource } from "@/types/skill-source";
import type { InstalledRecord } from "@/types/market";
import styles from "@/pages/Hermes/styles.module.css";

const PAGE_SIZE = 24;

export default function OpenSourceSkills({ embedded = false }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<UserSkillSource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Array<{ category: string; count: number }>>([]);
  const [category, setCategory] = useState<string | undefined>();
  const [keyword, setKeyword] = useState("");
  const [installedIds, setInstalledIds] = useState<Set<number | string>>(new Set());
  const [installing, setInstalling] = useState<Record<number, boolean>>({});

  const loadCategories = useCallback(async () => {
    try {
      const res = await marketApi.listSkillSourceCategories();
      setCategories(res || []);
    } catch (err) {
      console.warn("[OpenSourceSkills] load categories failed:", err);
    }
  }, []);

  const loadInstalled = useCallback(async () => {
    try {
      const list = await marketApi.listInstalled().catch(() => [] as InstalledRecord[]);
      setInstalledIds(new Set(list.filter((r) => r.type === "skill").map((r) => r.id)));
    } catch (err) {
      console.warn("[OpenSourceSkills] load installed failed:", err);
    }
  }, []);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await marketApi.listSkillSources({
        page,
        pageSize: PAGE_SIZE,
        category,
        keyword: keyword || undefined,
      });
      setSources(res.list || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error("[OpenSourceSkills] load failed:", err);
      message.error("加载开源技能库失败");
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [page, category, keyword]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    void loadCategories();
    void loadInstalled();
  }, [loadCategories, loadInstalled]);

  /** GitHub 直连下载安装 */
  const handleInstall = async (source: UserSkillSource) => {
    if (!source.candidates || source.candidates.length === 0) {
      message.warning("该技能未解析到 GitHub 下载地址，可点击链接访问原始来源");
      return;
    }
    setInstalling((prev) => ({ ...prev, [source.id]: true }));
    try {
      const res = await marketApi.installGithubSkill(source.id, source.name, source.candidates);
      if (!res.ok) throw new Error(res.error || "下载失败");
      message.success(`技能「${source.name}」已下载安装到本地`);
      setInstalledIds((prev) => new Set(prev).add(source.id));
    } catch (err) {
      console.error("[OpenSourceSkills] install failed:", err);
      message.error("下载失败: " + (err as Error).message);
    } finally {
      setInstalling((prev) => ({ ...prev, [source.id]: false }));
    }
  };

  return (
    <div className={styles.pageContainer}>
      <Spin spinning={loading}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <Input.Search
            placeholder="搜索技能名称 / 描述"
            allowClear
            style={{ width: 260 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => {
              setPage(1);
              void loadSources();
            }}
          />
          <Select
            placeholder="按分类筛选"
            allowClear
            showSearch
            style={{ width: 200 }}
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
              void loadSources();
            }}
            options={(categories || []).map((c) => ({
              label: `${c.category}（${c.count}）`,
              value: c.category,
            }))}
          />
          <span style={{ color: "#6e7681", fontSize: 12 }}>共 {total} 条开源技能，点击「下载安装」将直接从 GitHub 下载到本地</span>
        </div>

        {sources.length === 0 && !loading ? (
          <Empty description="暂无开源技能（可在管理后台「GitHub 资产导入」导入技能目录仓库）" style={{ marginTop: 60 }} />
        ) : (
          <div className={styles.skillGrid}>
            {sources.map((source) => {
              const installed = installedIds.has(source.id);
              return (
                <Card key={source.id} className={styles.skillCard} bordered={false}>
                  <div className={styles.skillCardBody}>
                    <div className={styles.skillHeader}>
                      <div className={styles.skillName}>
                        <div className={styles.skillIcon}>
                          <GithubOutlined />
                        </div>
                        <span>{source.name}</span>
                      </div>
                      {installed && (
                        <Tag className={styles.installedTag}>
                          <CheckCircleOutlined style={{ marginRight: 4 }} />
                          已安装
                        </Tag>
                      )}
                    </div>

                    <div className={styles.skillDesc}>
                      {source.description || "暂无描述"}
                    </div>

                    <div className={styles.skillMeta}>
                      <Tag color="geekblue" style={{ marginRight: 8 }}>{source.category || "其他"}</Tag>
                      {source.repoUrl && (
                        <a href={source.repoUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          {source.repoUrl.replace("https://github.com/", "")}
                        </a>
                      )}
                    </div>

                    <div className={styles.skillActions}>
                      {installed ? (
                        <Button disabled icon={<CheckCircleOutlined />}>
                          已安装
                        </Button>
                      ) : (
                        <Button
                          type="primary"
                          className={styles.primaryBtn}
                          icon={<DownloadOutlined />}
                          loading={!!installing[source.id]}
                          onClick={() => void handleInstall(source)}
                        >
                          下载安装
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={setPage}
            showSizeChanger={false}
            showTotal={(t) => `共 ${t} 条`}
          />
        </div>
      </Spin>
    </div>
  );
}
