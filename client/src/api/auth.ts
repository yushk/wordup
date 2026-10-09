import { post, get, put } from './http'

export interface UserInfo {
  id: number
  email: string
  nickname: string
  role: string
}

export interface AuthResult {
  token: string
  user: UserInfo
}

export const authApi = {
  login: (data: { email: string; password: string }) => post<AuthResult>('/auth/login', data),
  register: (data: { email: string; password: string; nickname: string }) =>
    post<AuthResult>('/auth/register', data),
  me: () => get<UserInfo>('/auth/me'),
  updateProfile: (data: { nickname: string }) => put<UserInfo>('/auth/profile', data),
}
