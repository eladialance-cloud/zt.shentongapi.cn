// 我的-技能包：已安装技能包列表
// 调用 GET /hermes/skills/installed

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Empty, Spin, Tag, message } from "antd";
import {
  CheckCircleOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import * as hermesApi from "@/api/hermes-api";
import type { InstalledSkill } from "@/types/hermes";
import styles from "./styles.module.css";

export default function InstalledSkills() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await hermesApi.listInstalledSkills();
      setSkills(list || []);
    } catch (err) {
      console.error("[InstalledSkills] load failed:", err);
      message.error("加载已安装技能包失败");
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <Spin spinning={loading}>
      {skills.length === 0 && !loading ? (
        <Empty
          description="暂无已安装技能包，去官方市场安装一个吧"
          style={{ marginTop: 48 }}
        />
      ) : (
        <div className={styles.skillGrid}>
          {skills.map((skill) => (
            <Card key={skill.id} className={styles.skillCard} bordered={false}>
              <div className={styles.skillBody}>
                <div className={styles.skillHeader}>
                  <div className={styles.skillIcon}>
                    <ThunderboltOutlined />
                  </div>
                  <span className={styles.skillName}>{skill.name}</span>
                  {skill.mounted && (
                    <Tag color="green">
                      <CheckCircleOutlined /> 已挂载
                    </Tag>
                  )}
                </div>
                <div className={styles.skillDesc}>
                  {skill.description || "暂无描述"}
                </div>
                <div className={styles.skillMeta}>
                  <span>作者：{skill.author}</span>
                  <span>
                    {skill.pricePerMinute === 0
                      ? "免费"
                      : `${skill.pricePerMinute} 积分/分钟`}
                  </span>
                </div>
                <div className={styles.skillActions}>
                  <Button
                    size="small"
                    onClick={() => navigate("/hermes")}
                  >
                    去 Hermes 挂载
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Spin>
  );
}
