import { HttpInterceptorFn } from '@angular/common/http';
import { REQUEST, inject } from '@angular/core';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
	const incoming = inject(REQUEST, { optional: true });
	let headers = req.headers;
	const cookie = incoming?.headers?.get('cookie');
	if (cookie && !headers.has('cookie')) {
		headers = headers.set('cookie', cookie);
	}
	let url = req.url;
	if (incoming && !/^https?:\/\//i.test(url)) {
		try {
			url = new URL(url, incoming.url).toString();
		} catch {
			url = req.url;
		}
	}
	return next(req.clone({ url, headers, withCredentials: true }));
};
