// 素材库页（三期 3.1）—— 网格视图 + 类型/归档筛选 + 详情弹窗 + 手动登记 + 归档
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Card, Descriptions, Empty, Form, Image, Input, Modal, Pagination, Select, Space, Spin, Switch, Tag, Typography, message,
} from "antd";
import {
  FileOutlined, FolderOutlined, LinkOutlined, PlusOutlined, ReloadOutlined,
} from "@ant-design/icons";
import { createMediaAsset, listMediaAssets, updateMediaAsset } from "@/api/media-asset-api";
import type { MediaAsset, MediaAssetType } from "@/api/media-asset-api";
import styles from "./styles.module.css";

const TYPE_OPTIONS = [
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "file", label: "文件" },
];

const TYPE_LABELS: Record<MediaAssetType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  file: "文件",
};

const PAGE_SIZE = 12;

function formatSize(bytes?: number | null): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function formatTime(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 根据 URL 推断素材类型（登记表单自动填充） */
function guessTypeByUrl(url: string): MediaAssetType {
  const ext = url.split("?")[0].split("#")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(ext)) return "image";
  if (/\.(mp4|webm|mov|m4v|avi)$/.test(ext)) return "video";
  if (/\.(mp3|wav|ogg|flac|m4a)$/.test(ext)) return "audio";
  return "file";
}

interface CreateFormValues {
  title: string;
  url: string;
  assetType?: MediaAssetType;
  tags?: string[];
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState<MediaAssetType | undefined>();
  const [showArchived, setShowArchived] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState<MediaAsset | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [form] = Form.useForm<CreateFormValues>();

  const load = useCallback(async (targetPage = 1, type?: MediaAssetType, archived = false) => {
    setLoading(true);
    try {
      const res = await listMediaAssets({
        type,
        archived,
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      setAssets(res.list);
      setTotal(res.total);
      setPage(targetPage);
    } catch (err) {
      message.error("素材加载失败: " + (err as Error).message);
      setAssets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(1, typeFilter, showArchived); }, [load, typeFilter, showArchived]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return assets;
    return assets.filter((a) => a.title.toLowerCase().includes(kw) || (a.tags ?? []).some((t) => t.toLowerCase().includes(kw)));
  }, [assets, keyword]);

  const onArchive = async (asset: MediaAsset) => {
    setActingId(asset.id);
    try {
      await updateMediaAsset(asset.id, { archived: !asset.archived });
      message.success(asset.archived ? "已恢复" : "已归档");
      if (detail?.id === asset.id) setDetail(null);
      void load(page, typeFilter, showArchived);
    } catch (err) {
      message.error("操作失败: " + (err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  const handleCreate = async () => {
    const vals = await form.validateFields().catch(() => null);
    if (!vals) return;
    setSaving(true);
    try {
      await createMediaAsset({
        title: vals.title,
        url: vals.url,
        assetType: vals.assetType ?? guessTypeByUrl(vals.url),
        tags: vals.tags,
      });
      message.success("素材已登记");
      setCreateOpen(false);
      form.resetFields();
      void load(1, typeFilter, showArchived);
    } catch (err) {
      message.error("登记失败: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = (url: string) => {
    void navigator.clipboard?.writeText(url).then(
      () => message.success("链接已复制"),
      () => message.warning("复制失败，请手动复制"),
    );
  };

  const renderPreview = (asset: MediaAsset) => {
    if (asset.assetType === "image") {
      return (
        <Image
          src={asset.url}
          alt={asset.title}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          preview={{ mask: <span>预览</span> }}
        />
      );
    }
    if (asset.assetType === "video") {
      return <video src={asset.url} controls preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
    }
    if (asset.assetType === "audio") {
      return (
        <div className={styles.audioPreview}>
          <FileOutlined style={{ fontSize: 40, color: "var(--color-brand)" }} />
          <audio src={asset.url} controls style={{ width: "80%" }} />
        </div>
      );
    }
    return (
      <div className={styles.audioPreview}>
        <FileOutlined style={{ fontSize: 40, color: "var(--color-brand)" }} />
        <span className={styles.fileName}>{asset.title}</span>
      </div>
    );
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><FolderOutlined /></span>
          <span>素材库</span>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ReloadOutlined />} onClick={() => void load(page, typeFilter, showArchived)}>刷新</Button>
          <Button type="primary" className={styles.primaryBtn} icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>
            登记素材
          </Button>
        </div>
      </div>

      <Card className={styles.filterCard} bordered={false}>
        <Space wrap size={12}>
          <Select
            allowClear
            placeholder="素材类型"
            style={{ width: 140 }}
            options={TYPE_OPTIONS}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v)}
          />
          <Switch checked={showArchived} onChange={setShowArchived} checkedChildren="含已归档" unCheckedChildren="仅未归档" />
          <Input
            allowClear
            placeholder="搜索标题/标签"
            prefix={<FileOutlined />}
            style={{ width: 220 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Space>
      </Card>

      <Spin spinning={loading}>
        {filtered.length === 0 && !loading ? (
          <Card className={styles.tableCard} bordered={false}>
            <Empty style={{ margin: "48px 0" }} description={keyword ? "没有匹配的素材" : "暂无素材，去对话/任务里生成并登记"} />
          </Card>
        ) : (
          <div className={styles.grid}>
            {filtered.map((asset) => (
              <Card
                key={asset.id}
                className={styles.assetCard}
                bordered={false}
                hoverable
                onClick={() => setDetail(asset)}
              >
                <div className={styles.previewBox}>{renderPreview(asset)}</div>
                <div className={styles.assetMeta}>
                  <div className={styles.assetTitle} title={asset.title}>{asset.title}</div>
                  <Space size={4}>
                    <Tag color={asset.assetType === "image" ? "blue" : asset.assetType === "video" ? "purple" : "default"}>
                      {TYPE_LABELS[asset.assetType] || asset.assetType}
                    </Tag>
                    {asset.archived && <Tag color="orange">已归档</Tag>}
                  </Space>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>

      {total > PAGE_SIZE && (
        <div className={styles.pager}>
          <Pagination current={page} total={total} pageSize={PAGE_SIZE} showSizeChanger={false} onChange={(p) => void load(p, typeFilter, showArchived)} />
        </div>
      )}

      <Modal
        open={!!detail}
        title="素材详情"
        footer={
          detail ? (
            <Space>
              <Button icon={<LinkOutlined />} onClick={() => copyUrl(detail.url)}>复制链接</Button>
              <Button loading={actingId === detail.id} onClick={() => onArchive(detail)}>
                {detail.archived ? "恢复" : "归档"}
              </Button>
              <Button type="primary" onClick={() => setDetail(null)}>关闭</Button>
            </Space>
          ) : null
        }
        onCancel={() => setDetail(null)}
        width={640}
      >
        {detail && (
          <>
            <div className={styles.detailPreview}>{renderPreview(detail)}</div>
            <Descriptions column={1} size="small" bordered style={{ marginTop: 12 }}>
              <Descriptions.Item label="标题">{detail.title}</Descriptions.Item>
              <Descriptions.Item label="类型">{TYPE_LABELS[detail.assetType] || detail.assetType}</Descriptions.Item>
              <Descriptions.Item label="来源">
                {detail.sourceType === "task" ? "任务产出" : detail.sourceType === "media_job" ? "媒体生成" : "手动登记"}
                {detail.sourceId != null ? ` #${detail.sourceId}` : ""}
              </Descriptions.Item>
              <Descriptions.Item label="大小">{formatSize(detail.fileSize)}</Descriptions.Item>
              <Descriptions.Item label="标签">{detail.tags?.length ? detail.tags.join("、") : "-"}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatTime(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="地址">
                <Typography.Link onClick={() => copyUrl(detail.url)}>{detail.url}</Typography.Link>
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>

      <Modal
        title="登记素材"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={saving}
        okText="登记"
        cancelText="取消"
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="素材地址" name="url" rules={[{ required: true, message: "请输入素材地址" }]}>
            <Input placeholder="https://... 图片/视频/音频/文件直链" />
          </Form.Item>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="素材标题" maxLength={255} showCount />
          </Form.Item>
          <Form.Item label="类型" name="assetType" tooltip="不填则按 URL 后缀自动识别">
            <Select allowClear placeholder="自动识别" options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item label="标签" name="tags">
            <Select mode="tags" placeholder="如: 海报、电商" tokenSeparators={[",", "，"]} allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
