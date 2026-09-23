export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

class ApiClient {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('deliveryos_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /** Clears the stored session and notifies the auth context to reset state. */
  private handleSessionExpired(): void {
    localStorage.removeItem('deliveryos_token');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('deliveryos:session-expired'));
    }
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const rawBase = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || '/api';
    const apiBaseUrl = rawBase.replace(/\/$/, '');
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${apiBaseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    let body: ApiResponse<T>;
    try {
      body = await res.json();
    } catch {
      throw new Error(`Failed to parse response from server (${res.status})`);
    }

    if (!res.ok || body.success === false) {
      const message = body?.error?.message || `Request failed with status ${res.status}`;
      const err: any = new Error(message);
      err.code = body?.error?.code || 'UNKNOWN_ERROR';
      err.status = res.status;

      // Expired/invalid session: force a clean logout so the router sends the
      // user back to /login. Credential failures on /auth/login must be
      // surfaced to the form instead of triggering a silent redirect.
      const isAuthEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/me');
      const isSuspendedOrDeactivated =
        body?.error?.code === 'FORBIDDEN' && /suspended|deactivated/i.test(body?.error?.message || '');

      if (!isAuthEndpoint && (res.status === 401 || isSuspendedOrDeactivated)) {
        this.handleSessionExpired();
      }

      throw err;
    }

    return body.data as T;
  }

  get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          searchParams.append(key, String(val));
        }
      });
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }
    return this.request<T>(url, { method: 'GET' });
  }

  post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
