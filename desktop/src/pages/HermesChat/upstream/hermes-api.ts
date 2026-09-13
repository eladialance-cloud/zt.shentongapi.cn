const noop = async (): Promise<void> => {}
const falsePromise = async (): Promise<boolean> => false
const nullPromise = async (): Promise<string | null> => null

const defaultHermesAPI = {
  copyToClipboard: noop,
  openExternal: async (url: string): Promise<void> => {
    await (window as any).electronAPI?.app?.openExternal?.(url)
  },
  showMediaMenu: noop,
  saveMediaFile: falsePromise,
  readMediaFile: nullPromise,
  resolveMediaDataUri: nullPromise,
  downloadFile: falsePromise,
  transcribeAudio: nullPromise,
  getPathForFile: () => '',
  stageAttachment: nullPromise,
  readSoul: async (profile?: string) => { const r = await (window as any).electronAPI?.hermesSoul?.get?.(profile); return r?.content ?? '' },
  writeSoul: async (text: string, profile?: string) => { await (window as any).electronAPI?.hermesSoul?.save?.(profile ?? '', text) },
  resetSoul: async (profile?: string) => { const r = await (window as any).electronAPI?.hermesSoul?.get?.(profile); return r?.content ?? '' },
  // --- B 批补充：文件 / 目录 / 终端 / 网页预览的兜底（主进程 IPC 后续接入前先优雅降级） ---
  readFile: async (path: string, maxBytes?: number) => await (window as any).electronAPI?.fs?.readFile?.(path, maxBytes),
  readImageFile: async (path: string) => await (window as any).electronAPI?.fs?.readImageFile?.(path),
  openFileInEditor: async (path: string) => (await (window as any).electronAPI?.fs?.openFileInEditor?.(path)) ?? false,
  openTerminal: async (path: string) => (await (window as any).electronAPI?.fs?.openTerminal?.(path)) ?? false,
  readDirectory: async (path: string) => await (window as any).electronAPI?.fs?.readDirectory?.(path),
  selectFolder: async () => await (window as any).electronAPI?.fs?.selectFolder?.(),
  listRecentSessionContextFolders: async (limit?: number) => (await (window as any).electronAPI?.fs?.listRecentContextFolders?.(limit)) ?? [],
  setSessionContextFolder: async (folder: string | null) => (await (window as any).electronAPI?.fs?.setSessionContextFolder?.(folder)) ?? true,
  inspectWebPreview: async (id: number) => await (window as any).electronAPI?.webPreview?.inspect?.(id),
  cancelWebPreviewInspection: async (id: number) => { await (window as any).electronAPI?.webPreview?.cancelInspection?.(id) },
}

const resolved = (window as unknown as { hermesAPI?: unknown }).hermesAPI
export const hermesAPI: any = resolved ?? defaultHermesAPI