import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type ApiRequestOptions = {
	headers?: Record<string, string>;
};

@Injectable({ providedIn: 'root' })
export class ApiService {
	private readonly http = inject(HttpClient);

	private httpHeaders(extra?: Record<string, string>): HttpHeaders | undefined {
		if (!extra || Object.keys(extra).length === 0) return undefined;
		return new HttpHeaders(extra);
	}

	get<T>(
		url: string,
		params?: Record<string, string | number | undefined | null>,
		options?: ApiRequestOptions
	) {
		const clean: Record<string, string> = {};
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
			}
		}
		return firstValueFrom(
			this.http.get<T>(url, {
				params: clean,
				withCredentials: true,
				headers: this.httpHeaders(options?.headers)
			})
		);
	}

	post<T>(url: string, body?: unknown, options?: ApiRequestOptions) {
		return firstValueFrom(
			this.http.post<T>(url, body ?? {}, {
				withCredentials: true,
				headers: this.httpHeaders(options?.headers)
			})
		);
	}

	put<T>(url: string, body?: unknown, options?: ApiRequestOptions) {
		return firstValueFrom(
			this.http.put<T>(url, body ?? {}, {
				withCredentials: true,
				headers: this.httpHeaders(options?.headers)
			})
		);
	}

	delete<T>(url: string, options?: ApiRequestOptions) {
		return firstValueFrom(
			this.http.delete<T>(url, {
				withCredentials: true,
				headers: this.httpHeaders(options?.headers)
			})
		);
	}
}
