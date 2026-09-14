// 素材库（2026-09-14 收敛为「单层 · 两库」）
// 本页只有一层 Tab：用户输入库 / 生成素材库；类别是这一层下面的二级过滤，不再有第二层库 Tab。
//
// 原「合成视频 / 形象视频 / 音频素材」三个只读面板与本页两库内容重复（数据就是同一批 media_assets），
// 且形象 / 声音的创建入口本来就在「口播工坊」；「知识库」在侧边栏已有独立入口。
// 因此一并删除：去掉重复入口与「两层 Tab」的歧义，素材只从「输入库 / 生成库」进出。
import { FolderOutlined } from "@ant-design/icons";
import AssetLibraryTab from "./AssetLibrary";
import styles from "./styles.module.css";

export default function AssetsPage() {
  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><FolderOutlined /></span>
          <span>素材库</span>
        </div>
      </div>
      <AssetLibraryTab />
    </div>
  );
}
