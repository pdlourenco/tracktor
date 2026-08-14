import { goto } from '$app/navigation';
import { env } from '$lib/config/env';
import { apiClient } from '../helper/api.helper';
import type { ApiResponse } from '../response';
import { toast } from 'svelte-sonner';
import * as m from '$lib/paraglide/messages';

interface User {
  id: string;
  username: string;
}

class AuthStore {
  user = $state<User | null>(null);
  isLoggedIn = $state<boolean>(false);
  hasUsers = $state<boolean>(false);
  isAuthDisabled = $state<boolean>(env.DISABLE_AUTH);

  constructor() {
    this.isLoggedIn = env.DISABLE_AUTH;
    this.hasUsers = env.DISABLE_AUTH;
  }

  checkAuthStatus = async () => {
    if (this.isAuthDisabled) {
      this.isLoggedIn = true;
      this.hasUsers = true;
      return;
    }

    try {
      const { data: res } = await apiClient.get<ApiResponse>('/auth');
      this.isAuthDisabled = !!res.data?.isAuthDisabled;
      this.hasUsers = res.data?.hasUsers ?? false;

      if (this.isAuthDisabled) {
        this.isLoggedIn = true;
        this.hasUsers = true;
        return;
      }

      if (res.data.isAuthenticated && res.data.user) {
        this.user = res.data.user;
        this.isLoggedIn = true;
      } else {
        this.user = null;
        this.isLoggedIn = false;
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      this.hasUsers = false;
      this.user = null;
      this.isLoggedIn = this.isAuthDisabled;
    }
  };

  login = async (username: string, password: string) => {
    try {
      const { data: res } = await apiClient.post<ApiResponse>('/auth', { username, password });

      if (res.success && res.data) {
        this.user = res.data.user;
        this.isLoggedIn = true;
        toast.success(m.auth_toast_login_success());
        return true;
      }
      return false;
    } catch (err: any) {
      this.user = null;
      this.isLoggedIn = false;
      console.error('Login error:', err);
      toast.error(
        `${m.auth_toast_login_error_prefix()}${err.response?.data?.message || err.message}`
      );
      return false;
    }
  };

  register = async (username: string, password: string) => {
    try {
      const { data: res } = await apiClient.post<ApiResponse>('/auth/register', {
        username,
        password
      });

      if (res.success) {
        toast.success(m.auth_toast_register_success());
        this.hasUsers = true;
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Registration error:', err);
      toast.error(
        `${m.auth_toast_register_error_prefix()}${err.response?.data?.message || err.message}`
      );
      return false;
    }
  };

  logout = async () => {
    try {
      await apiClient.delete('/auth');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.user = null;
      this.isLoggedIn = false;
      goto('/login');
    }
  };

  updateProfile = async (data: {
    username?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => {
    try {
      const { data: res } = await apiClient.put<ApiResponse>('/auth/profile', data);

      if (res.success && res.data) {
        this.user = { ...this.user!, username: res.data.username };
        toast.success(m.profile_toast_updated());
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Profile update error:', err);
      toast.error(`${m.profile_toast_error_prefix()}${err.response?.data?.message || err.message}`);
      return false;
    }
  };
}

export const authStore = new AuthStore();
