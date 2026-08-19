// 知识库列表页 — Kimi 风格（v2.0）
// 布局：顶部标题 + 新建按钮 + 知识库卡片网格
// 调用 GET /knowledge/bases、POST /knowledge/bases、DELETE /knowledge/bases/:id

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Form, Input, Modal, Popconfirm, Select, Spin, Tabs, message } from "antd";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileText,
  Flame,
  LayoutGrid,
  Library,
  Lightbulb,
  ListChecks,
  Megaphone,
  Palette,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import * as kbApi from "@/api/knowledge-api";
import type {
  KnowledgeBase,
  CreateKnowledgeBaseDto,
  KnowledgeIndustry,
  OfficialKnowledgeBase,
} from "@/types/knowledge";
import { useSystemStore } from "@/store/system";
import { NetworkError } from "@/utils/errors";
import { openAdminUrl } from "@/utils/admin-url";
import {
  CATEGORY_LABELS,
  filterBasesByCategory,
  summarizeByCategory,
  totalDocumentCount,
  uncategorizedCount,
  type KnowledgeCategory,
} from "./category";
import styles from "./styles.module.css";

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return "-";
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 分类图标 */
function categoryIcon(
  category: Exclude<KnowledgeCategory, "uncategorized">,
): ReactNode {
  switch (category) {
    case "brand-rule":
      return <Palette size={22} strokeWidth={1.8} />;
    case "hit-case":
      return <Flame size={22} strokeWidth={1.8} />;
    case "topic-idea":
      return <Lightbulb size={22} strokeWidth={1.8} />;
    case "process-sop":
      return <ListChecks size={22} strokeWidth={1.8} />;
    case "customer-profile":
      return <Users size={22} strokeWidth={1.8} />;
    case "platform-rule":
      return <Megaphone size={22} strokeWidth={1.8} />;
    default:
      return <Library size={22} strokeWidth={1.8} />;
  }
}

export default function KnowledgeList() {
  const navigate = useNavigate();
  const backendAvailable = useSystemStore((s) => s.backendAvailable);
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateKnowledgeBaseDto>();
  const [creating, setCreating] = useState(false);

  // ===== 官方知识库 =====
  const [officialBases, setOfficialBases] = useState<OfficialKnowledgeBase[]>([]);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [industries, setIndustries] = useState<KnowledgeIndustry[]>([]);
  const [industryFilter, setIndustryFilter] = useState<number | undefined>(undefined);

  /** 加载知识库列表 */
  const loadBases = useCallback(async () => {
    setLoading(true);
    try {
      const list = await kbApi.listKnowledgeBases();
      setBases(list || []);
    } catch (err) {
      console.error("[KnowledgeList] load failed:", err);
      if (!(err instanceof NetworkError) || backendAvailable) {
        message.error("加载知识库列表失败");
      }
      setBases([]);
    } finally {
      setLoading(false);
    }
  }, [backendAvailable]);

  useEffect(() => {
    void loadBases();
  }, [loadBases]);

  /** 加载官方知识库列表 */
  const loadOfficial = useCallback(async () => {
    setOfficialLoading(true);
    try {
      const data = await kbApi.listOfficialKnowledgeBases({
        page: 1,
        pageSize: 50,
        industryId: industryFilter,
      });
      setOfficialBases(data?.list || []);
    } catch (err) {
      console.error("[KnowledgeList] load official failed:", err);
      if (!(err instanceof NetworkError) || backendAvailable) {
        message.error("加载官方知识库失败");
      }
      setOfficialBases([]);
    } finally {
      setOfficialLoading(false);
    }
  }, [backendAvailable, industryFilter]);

  /** 加载行业分类 */
  const loadIndustries = useCallback(async () => {
    try {
      const data = await kbApi.listKnowledgeIndustries();
      setIndustries(data || []);
    } catch (err) {
      console.error("[KnowledgeList] load industries failed:", err);
      setIndustries([]);
    }
  }, []);

  useEffect(() => {
    void loadIndustries();
  }, [loadIndustries]);

  useEffect(() => {
    void loadOfficial();
  }, [loadOfficial]);

  /** 新建知识库 */
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      await kbApi.createKnowledgeBase(values);
      message.success("知识库创建成功");
      setCreateOpen(false);
      createForm.resetFields();
      void loadBases();
    } catch (err) {
      // validateFields 失败不弹错
      if (err && typeof err === "object" && "errorFields" in err) return;
      console.error("[KnowledgeList] create failed:", err);
      message.error("创建知识库失败: " + (err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  /** 删除知识库 */
  const handleDelete = async (kb: KnowledgeBase) => {
    try {
      await kbApi.deleteKnowledgeBase(kb.id);
      message.success("知识库 " + kb.name + " 已删除");
      setBases((prev) => prev.filter((k) => k.id !== kb.id));
    } catch (err) {
      console.error("[KnowledgeList] delete failed:", err);
      message.error("删除失败: " + (err as Error).message);
    }
  };

  /** 进入文档管理 */
  const handleEnter = (kb: KnowledgeBase) => {
    navigate('/knowledge/' + kb.id + '/documents');
  };

  /** 进入检索测试 */
  const handleSearch = (kb: KnowledgeBase) => {
    navigate('/knowledge/' + kb.id + '/search');
  };

  /** 当前视图：null=分类卡；"all"=全部列表；其余=分类过滤列表 */
  const [view, setView] = useState<KnowledgeCategory | "all" | null>(null);

  /** 6 分类汇总（分类卡数据源） */
  const summaries = useMemo(() => summarizeByCategory(bases), [bases]);

  /** 当前列表视图下的知识库 */
  const filteredBases = useMemo(() => {
    if (view === "all") return bases;
    if (view === null) return [];
    return filterBasesByCategory(bases, view);
  }, [bases, view]);

  /** 当前列表视图下的文档总数 */
  const filteredDocCount = useMemo(
    () => filteredBases.reduce((sum, kb) => sum + (kb.documentCount ?? 0), 0),
    [filteredBases],
  );

  /** 分类卡「创建」：打开创建弹窗并预填分类名 */
  const handleCreateInCategory = (label: string) => {
    createForm.setFieldsValue({ name: label });
    setCreateOpen(true);
  };

  /** 知识库卡片（过滤列表视图复用） */
  const renderBaseCard = (kb: KnowledgeBase) => (
    <div key={kb.id} className={styles.kbCard}>
      <div className={styles.kbCardIcon}>
        <BookOpen size={34} strokeWidth={1.5} />
      </div>
      <div className={styles.kbCardBody}>
        <div className={styles.kbCardTitle}>{kb.name}</div>
        <div className={styles.kbCardDescription}>
          {kb.description || "暂无描述"}
        </div>
        <div className={styles.kbCardMeta}>
          <span className={styles.metaItem}>
            <FileText size={12} />
            {kb.documentCount ?? 0} 个文档
          </span>
          <span className={styles.metaItem}>
            创建于 {formatTime(kb.createdAt)}
          </span>
        </div>
      </div>
      <div className={styles.kbCardFooter}>
        <Button
          type="primary"
          className={styles.primaryBtn + " " + styles.enterBtn}
          onClick={() => handleEnter(kb)}
        >
          进入详情
        </Button>
        <Button
          className={styles.ghostBtn}
          icon={<Search size={14} />}
          title="检索测试"
          onClick={() => handleSearch(kb)}
        />
        <Popconfirm
          title="确定删除该知识库吗？"
          description="删除后将清除所有文档与向量索引"
          onConfirm={() => handleDelete(kb)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button
            className={styles.dangerBtn}
            icon={<Trash2 size={14} />}
            title="删除"
          />
        </Popconfirm>
      </div>
    </div>
  );

  /** 返回 */
  const handleBack = () => {
    navigate("/dashboard");
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <Library size={18} />
          </span>
          <span>知识库</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.ghostBtn}
            icon={<ArrowLeft size={14} />}
            onClick={handleBack}
          >
            返回
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
          >
            新建知识库
          </Button>
        </div>
      </div>

      <Tabs
        className={styles.tabs}
        defaultActiveKey="mine"
        items={[
          {
            key: "mine",
            label: "我的知识库",
            children: (
              <Spin spinning={loading}>
                {view === null ? (
                  <div className={styles.categoryGrid}>
                    {/* 全部：未分类知识库并入此列表 */}
                    <div className={styles.categoryCard + " " + styles.categoryAllCard}>
                      <div className={styles.categoryCardIcon}>
                        <LayoutGrid size={22} strokeWidth={1.8} />
                      </div>
                      <div className={styles.categoryCardBody}>
                        <div className={styles.categoryCardName}>全部</div>
                        <div className={styles.categoryCardCount}>
                          {totalDocumentCount(bases)}
                          <span className={styles.categoryCardCountLabel}>个文档</span>
                        </div>
                        <div className={styles.categoryCardMeta}>
                          {bases.length} 个知识库
                          {uncategorizedCount(bases) > 0 && (
                            <span>
                              {" · "}含未分类 {uncategorizedCount(bases)} 个
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={styles.categoryCardFooter}>
                        <Button
                          type="primary"
                          className={styles.primaryBtn + " " + styles.enterBtn}
                          icon={<ArrowRight size={14} />}
                          onClick={() => setView("all")}
                          disabled={bases.length === 0}
                        >
                          查看全部
                        </Button>
                      </div>
                    </div>
                    {summaries.map((s) => (
                      <div key={s.category} className={styles.categoryCard}>
                        <div className={styles.categoryCardIcon}>
                          {categoryIcon(s.category)}
                        </div>
                        <div className={styles.categoryCardBody}>
                          <div className={styles.categoryCardName}>{s.label}</div>
                          <div className={styles.categoryCardCount}>
                            {s.documentCount}
                            <span className={styles.categoryCardCountLabel}>个文档</span>
                          </div>
                          <div className={styles.categoryCardMeta}>
                            {s.kbCount} 个知识库
                          </div>
                        </div>
                        <div className={styles.categoryCardFooter}>
                          {s.kbCount > 0 ? (
                            <Button
                              type="primary"
                              className={styles.primaryBtn + " " + styles.enterBtn}
                              icon={<ArrowRight size={14} />}
                              onClick={() => setView(s.category)}
                            >
                              进入
                            </Button>
                          ) : (
                            <Button
                              className={styles.ghostBtn + " " + styles.enterBtn}
                              icon={<Plus size={14} />}
                              onClick={() => handleCreateInCategory(s.label)}
                            >
                              创建
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className={styles.listHeader}>
                      <Button
                        className={styles.ghostBtn}
                        icon={<ArrowLeft size={14} />}
                        onClick={() => setView(null)}
                      >
                        返回分类
                      </Button>
                      <div className={styles.listHeaderTitle}>
                        {view === "all" ? "全部知识库" : CATEGORY_LABELS[view]}
                      </div>
                      <div className={styles.listHeaderMeta}>
                        {filteredBases.length} 个知识库 · {filteredDocCount} 个文档
                      </div>
                    </div>
                    {filteredBases.length === 0 ? (
                      <div className={styles.emptyState}>
                        <Library
                          className={styles.emptyStateIcon}
                          size={44}
                          strokeWidth={1}
                        />
                        <div className={styles.emptyStateText}>
                          {view === "all"
                            ? "暂无知识库，点击右上角「新建知识库」开始"
                            : "该分类暂无知识库，可在分类卡上点击「创建」"}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.kbGrid}>
                        {filteredBases.map((kb) => renderBaseCard(kb))}
                      </div>
                    )}
                  </>
                )}
              </Spin>
            ),
          },
          {
            key: "official",
            label: "官方知识库",
            children: (
              <>
                <div className={styles.filterBar}>
                  <Select
                    allowClear
                    placeholder="全部行业"
                    className={styles.industrySelect}
                    value={industryFilter}
                    onChange={(v?: number) => setIndustryFilter(v)}
                    options={industries.map((c) => ({ label: c.name, value: c.id }))}
                  />
                  <span className={styles.filterHint}>
                    管理后台按行业发布的官方知识库，可在聊天中选择挂载使用
                  <a
                    className={styles.filterHint}
                    style={{ cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => openAdminUrl("/admin/content/knowledge-bases")}
                  >
                    管理官方库 →
                  </a>
                  </span>
                </div>
                <Spin spinning={officialLoading}>
                  {officialBases.length === 0 && !officialLoading ? (
                    <div className={styles.emptyState}>
                      <Library className={styles.emptyStateIcon} size={44} strokeWidth={1} />
                      <div className={styles.emptyStateText}>暂无官方知识库</div>
                    </div>
                  ) : (
                    <div className={styles.kbGrid}>
                      {officialBases.map((kb) => (
                        <div key={kb.id} className={styles.kbCard}>
                          <div className={styles.kbCardIcon}>
                            <BookOpen size={34} strokeWidth={1.5} />
                          </div>
                          <div className={styles.kbCardBody}>
                            <div className={styles.kbCardTitle}>
                              {kb.name}
                              {kb.industryName && (
                                <span className={styles.industryTag}>{kb.industryName}</span>
                              )}
                            </div>
                            <div className={styles.kbCardDescription}>
                              {kb.description || "暂无描述"}
                            </div>
                            <div className={styles.kbCardMeta}>
                              <span className={styles.metaItem}>
                                <FileText size={12} />
                                {kb.documentCount ?? 0} 个文档
                              </span>
                              <span className={styles.metaItem}>
                                发布于 {formatTime(kb.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Spin>
              </>
            ),
          },
        ]}
      />

      {/* 新建知识库弹窗 */}
      <Modal
        title="新建知识库"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            label="名称"
            name="name"
            rules={[
              { required: true, message: "请输入知识库名称" },
              { max: 64, message: "名称最多 64 个字符" },
            ]}
          >
            <Input placeholder="请输入知识库名称" />
          </Form.Item>
          <Form.Item
            label="描述"
            name="description"
            rules={[{ max: 256, message: "描述最多 256 个字符" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="可选，知识库用途描述"
              maxLength={256}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
