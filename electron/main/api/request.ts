import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

export const instanceAxios = axios.create({
  headers: { Accept: 'application/json' },
});

export function configureApiRequest(baseURL: string, timeout: number) {
  instanceAxios.defaults.baseURL = baseURL;
  instanceAxios.defaults.timeout = timeout;
}

export default function request<T = unknown>(
  options: AxiosRequestConfig,
): Promise<AxiosResponse<T>> {
  return instanceAxios.request<T>(options);
}
