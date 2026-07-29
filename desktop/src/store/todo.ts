// 待办 store - Zustand + persist
// 持久化到 localStorage key: 'todo-store'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 待办优先级 */
export type TodoPriority = 'high' | 'medium' | 'low'

export interface TodoItem {
  id: number
  text: string
  done: boolean
  priority: TodoPriority
}

/** 待办 store 状态 */
export interface TodoState {
  todos: TodoItem[]
  /** 下一个自增 ID */
  nextId: number
  /** 添加待办 */
  addTodo: (text: string, priority?: TodoPriority) => void
  /** 切换待办完成状态 */
  toggleTodo: (id: number) => void
  removeTodo: (id: number) => void
  clearDone: () => void
}

const DEFAULT_TODOS: TodoItem[] = [
  { id: 1, text: '完成 Agent 市场浏', done: false, priority: 'high' },
  { id: 2, text: '配置 MCP 服务器接', done: false, priority: 'medium' },
  { id: 3, text: '查看本周积分消报', done: false, priority: 'medium' },
  { id: 4, text: '更新个人料头像', done: true, priority: 'low' },
]

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: DEFAULT_TODOS,
      nextId: DEFAULT_TODOS.length + 1,

      addTodo: (text, priority = 'medium') => {
 const trimmed = text.trim()
 if (!trimmed) return
 const id = get().nextId
 set((state) => ({
   todos: [...state.todos, { id, text: trimmed, done: false, priority }],
   nextId: id + 1,
 }))
      },

      toggleTodo: (id) => {
 set((state) => ({
   todos: state.todos.map((t) =>
     t.id === id ? { ...t, done: !t.done } : t
   ),
 }))
      },

      removeTodo: (id) => {
 set((state) => ({
   todos: state.todos.filter((t) => t.id !== id),
 }))
      },

      clearDone: () => {
 set((state) => ({
   todos: state.todos.filter((t) => !t.done),
 }))
      },
    }),
    {
      name: 'todo-store',
    }
  )
)
