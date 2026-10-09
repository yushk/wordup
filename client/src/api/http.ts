import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

/** 统一 API 客户端：附带 JWT、统一错误提示、401 跳登录 */
export const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('els_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) {
        ElMessage.error(body.message ?? '请求失败')
        return Promise.reject(new Error(body.message))
      }
      return body.data
    }
    return body
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('els_token')
      localStorage.removeItem('els_user')
      if (router.currentRoute.value.name !== 'login') {
        router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
      }
    }
    const msg = err.response?.data?.message ?? err.message ?? '网络错误'
    ElMessage.error(msg)
    return Promise.reject(err)
  },
)

/** 便捷类型：拦截器返回的就是 data 字段 */
type ApiResult<T> = Promise<T>

export function get<T>(url: string, params?: Record<string, unknown>): ApiResult<T> {
  return http.get(url, { params }) as unknown as ApiResult<T>
}

export function post<T>(url: string, data?: unknown): ApiResult<T> {
  return http.post(url, data) as unknown as ApiResult<T>
}

export function put<T>(url: string, data?: unknown): ApiResult<T> {
  return http.put(url, data) as unknown as ApiResult<T>
}

export function del<T>(url: string): ApiResult<T> {
  return http.delete(url) as unknown as ApiResult<T>
}
