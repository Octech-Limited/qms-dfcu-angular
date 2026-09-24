import type { Express, Request, Response, NextFunction } from 'express';
import { uuidV7 } from './ids';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { desc, eq } from 'drizzle-orm';
import { db } from './db';
import { ads, adBranches, branches } from './db/schema';
import { requireAnySession, requireAuth, sendAuthError, sendJson } from './auth';
import { purgeAdsExpiredOver30Days } from './adsCleanup';
import { logger } from './logger';
import { eatDayRange, eatNow, parseEatDateTime } from './timezone';
import { UUID_RE } from './tickets';

type MulterFile = Express.Multer.File;

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 50 * 1024 * 1024 }
});

const adsUpload = upload.fields([
	{ name: 'image', maxCount: 1 },
	{ name: 'video', maxCount: 1 }
]);

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res).catch(next);
	};
}

function p(req: Request, key: string): string {
	const value = req.params[key];
	return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}

function field(body: Record<string, unknown>, key: string): string {
	const v = body[key];
	if (Array.isArray(v)) return String(v[0] ?? '');
	return v == null ? '' : String(v);
}

function parseBranchIds(body: Record<string, unknown>): string[] {
	const raw = body['branchIds'];
	if (raw == null) return [];
	if (Array.isArray(raw)) {
		if (raw.length === 1 && typeof raw[0] === 'string') {
			try {
				const parsed = JSON.parse(raw[0]);
				return Array.isArray(parsed) ? parsed.map(String) : [String(raw[0])];
			} catch {
				return [String(raw[0])];
			}
		}
		return raw.map(String);
	}
	if (typeof raw === 'string') {
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.map(String) : [raw];
		} catch {
			return [raw];
		}
	}
	return [];
}

function filesOf(req: Request) {
	const files = req.files as { [fieldname: string]: MulterFile[] } | undefined;
	return {
		image: files?.['image']?.[0],
		video: files?.['video']?.[0]
	};
}

async function ensureUploadsDir() {
	const uploadsDir = path.join(process.cwd(), 'uploads');
	await mkdir(uploadsDir, { recursive: true });
	return uploadsDir;
}

async function saveUpload(file: MulterFile | undefined, kind: 'image' | 'video'): Promise<string | null> {
	if (!file || !file.buffer?.length) return null;
	if (kind === 'image') {
		const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
		if (!allowed.includes(file.mimetype)) {
			throw Object.assign(new Error('Invalid image file type. Allowed types: JPEG, PNG, GIF, WebP'), {
				status: 400
			});
		}
		if (file.size > 5 * 1024 * 1024) {
			throw Object.assign(new Error('Image file size exceeds 5MB limit'), { status: 400 });
		}
	} else {
		const allowed = ['video/mp4', 'video/webm', 'video/ogg'];
		if (!allowed.includes(file.mimetype)) {
			throw Object.assign(new Error('Invalid video file type. Allowed types: MP4, WebM, OGG'), {
				status: 400
			});
		}
		if (file.size > 50 * 1024 * 1024) {
			throw Object.assign(new Error('Video file size exceeds 50MB limit'), { status: 400 });
		}
	}
	const uploadsDir = await ensureUploadsDir();
	const filename = `${Date.now()}-${file.originalname.replace(/\s/g, '-')}`;
	await writeFile(path.join(uploadsDir, filename), file.buffer);
	return `/api/bank/ads/images/${filename}`;
}

async function unlinkMediaUrl(url: string | null | undefined) {
	if (!url) return;
	const filepath = path.join(process.cwd(), 'uploads', path.basename(url));
	try {
		await unlink(filepath);
	} catch (error) {
		logger.warn('Failed to delete ad media file:', error);
	}
}

function validateAdInput(body: Record<string, unknown>, opts: { requireMedia: boolean; hasFile: boolean }) {
	const name = field(body, 'name').trim();
	if (!name) return 'Name is required';
	if (name.length > 200) return 'Name exceeds maximum length (200 characters)';
	const dangerous = /(--|;|\/\*|\*\/|javascript:|<script|on\w+\s*=)/i;
	if (dangerous.test(name)) return 'Invalid characters in name';

	const youtubeUrl = field(body, 'youtubeUrl').trim();
	if (youtubeUrl) {
		if (youtubeUrl.length > 2048) return 'YouTube URL exceeds maximum length';
		if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(youtubeUrl)) {
			return 'Invalid YouTube URL format';
		}
	}

	const validFrom = field(body, 'validFrom').trim();
	const validUntil = field(body, 'validUntil').trim();
	try {
		if (validFrom) parseEatDateTime(validFrom);
		if (validUntil) parseEatDateTime(validUntil);
	} catch {
		return 'Invalid date format';
	}
	if (validFrom && validUntil) {
		if (parseEatDateTime(validUntil) < parseEatDateTime(validFrom)) {
			return 'validUntil must be after validFrom';
		}
	}

	const branchIds = parseBranchIds(body);
	if (!branchIds.length) return 'At least one branch ID is required';
	if (branchIds.length > 100) return 'Too many branch IDs (maximum 100)';
	for (const id of branchIds) {
		if (!UUID_RE.test(id)) return 'Invalid branch ID format';
	}

	if (opts.requireMedia && !opts.hasFile && !youtubeUrl) {
		return 'Either image, video, or YouTube URL is required';
	}
	return null;
}

function isAdCurrentlyValid(
	ad: { validFrom: Date | null; validUntil: Date | null },
	nowEat: Date,
	todayStart: Date,
	todayEnd: Date
) {
	const untilOk = !ad.validUntil || ad.validUntil > nowEat;
	if (!untilOk) return false;
	if (!ad.validFrom) return true;
	if (ad.validFrom <= nowEat) return true;
	return ad.validFrom >= todayStart && ad.validFrom <= todayEnd;
}

export function registerAdsRoutes(app: Express): void {
	app.get(
		'/api/bank/ads',
		wrap(async (req, res) => {
			const includeAll = String(req.query['includeAll'] || '') === 'true';
			const branchId = String(req.query['branchId'] || '');
			const skipDateFilter = includeAll || String(req.query['debug'] || '') === 'true';

			if (includeAll) {
				const auth = await requireAuth();
				if (auth.error) return sendAuthError(res, auth.error);
				await purgeAdsExpiredOver30Days();
			} else {
				const auth = await requireAnySession();
				if (auth.error) return sendAuthError(res, auth.error);
			}

			if (branchId && !UUID_RE.test(branchId)) {
				return sendJson(res, { error: 'Invalid branchId format' }, 400);
			}

			const nowEat = eatNow();
			const { today: todayStart, tomorrow } = eatDayRange();
			const todayEnd = new Date(tomorrow.getTime() - 1);

			const rows = await db.select().from(ads).orderBy(desc(ads.createdAt));
			const links = await db.select().from(adBranches);
			const branchRows = await db.select({ id: branches.id, name: branches.name }).from(branches);
			const branchNameMap = new Map(branchRows.map((b) => [b.id, b.name]));

			let result = rows.map((ad) => {
				const branchIds = links.filter((l) => l.adId === ad.id).map((l) => l.branchId);
				return {
					...ad,
					branchIds,
					branches: branchIds.map((id) => ({ id, name: branchNameMap.get(id) ?? id }))
				};
			});

			if (!skipDateFilter) {
				result = result.filter((ad) => isAdCurrentlyValid(ad, nowEat, todayStart, todayEnd));
			}
			if (branchId) {
				result = result.filter((ad) => ad.branchIds.includes(branchId));
			}

			sendJson(res, result);
		})
	);

	app.post(
		'/api/bank/ads',
		(req, res, next) => {
			adsUpload(req, res, (err) => {
				if (err) return sendJson(res, { error: err.message || 'Upload failed' }, 400);
				next();
			});
		},
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);

			const body = (req.body ?? {}) as Record<string, unknown>;
			const { image, video } = filesOf(req);
			const errMsg = validateAdInput(body, {
				requireMedia: true,
				hasFile: Boolean(image || video)
			});
			if (errMsg) return sendJson(res, { error: errMsg }, 400);

			let imagePath: string | null = null;
			let videoPath: string | null = null;
			try {
				imagePath = await saveUpload(image, 'image');
				videoPath = await saveUpload(video, 'video');
			} catch (e) {
				const status = (e as { status?: number }).status ?? 500;
				return sendJson(res, { error: e instanceof Error ? e.message : 'Upload failed' }, status);
			}

			const youtubeUrl = field(body, 'youtubeUrl').trim() || null;
			const validFromRaw = field(body, 'validFrom').trim();
			const validUntilRaw = field(body, 'validUntil').trim();
			const branchIds = parseBranchIds(body);
			const now = eatNow();
			const id = uuidV7();

			await db.insert(ads).values({
				id,
				name: field(body, 'name').trim(),
				image: imagePath,
				video: videoPath,
				youtubeUrl,
				isLive: field(body, 'isLive') === 'true',
				validFrom: validFromRaw ? parseEatDateTime(validFromRaw) : null,
				validUntil: validUntilRaw ? parseEatDateTime(validUntilRaw) : null,
				createdAt: now,
				updatedAt: now
			});
			for (const branchId of branchIds) {
				await db.insert(adBranches).values({ id: uuidV7(), adId: id, branchId });
			}

			const [row] = await db.select().top(1).from(ads).where(eq(ads.id, id));
			sendJson(res, { ...row, branchIds }, 201);
		})
	);

	app.put(
		'/api/bank/ads/:id',
		(req, res, next) => {
			adsUpload(req, res, (err) => {
				if (err) return sendJson(res, { error: err.message || 'Upload failed' }, 400);
				next();
			});
		},
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const id = p(req, 'id');
			if (!UUID_RE.test(id)) return sendJson(res, { error: 'Invalid ad ID format' }, 400);

			const [existing] = await db.select().top(1).from(ads).where(eq(ads.id, id));
			if (!existing) return sendJson(res, { error: 'Ad not found' }, 404);

			const body = (req.body ?? {}) as Record<string, unknown>;
			const { image, video } = filesOf(req);
			const errMsg = validateAdInput(body, {
				requireMedia: false,
				hasFile: Boolean(image || video)
			});
			if (errMsg) return sendJson(res, { error: errMsg }, 400);

			let imagePath = existing.image;
			let videoPath = existing.video;
			let youtubeUrl = existing.youtubeUrl;
			const youtubeField = field(body, 'youtubeUrl').trim();

			try {
				if (image) {
					await unlinkMediaUrl(existing.image);
					await unlinkMediaUrl(existing.video);
					imagePath = await saveUpload(image, 'image');
					videoPath = null;
					youtubeUrl = null;
				} else if (video) {
					await unlinkMediaUrl(existing.image);
					await unlinkMediaUrl(existing.video);
					videoPath = await saveUpload(video, 'video');
					imagePath = null;
					youtubeUrl = null;
				} else if (youtubeField) {
					await unlinkMediaUrl(existing.image);
					await unlinkMediaUrl(existing.video);
					imagePath = null;
					videoPath = null;
					youtubeUrl = youtubeField;
				}
			} catch (e) {
				const status = (e as { status?: number }).status ?? 500;
				return sendJson(res, { error: e instanceof Error ? e.message : 'Upload failed' }, status);
			}

			const validFromRaw = field(body, 'validFrom').trim();
			const validUntilRaw = field(body, 'validUntil').trim();
			const branchIds = parseBranchIds(body);

			await db
				.update(ads)
				.set({
					name: field(body, 'name').trim(),
					image: imagePath,
					video: videoPath,
					youtubeUrl,
					isLive: field(body, 'isLive') === 'true',
					validFrom: validFromRaw ? parseEatDateTime(validFromRaw) : null,
					validUntil: validUntilRaw ? parseEatDateTime(validUntilRaw) : null,
					updatedAt: eatNow()
				})
				.where(eq(ads.id, id));

			await db.delete(adBranches).where(eq(adBranches.adId, id));
			for (const branchId of branchIds) {
				await db.insert(adBranches).values({ id: uuidV7(), adId: id, branchId });
			}

			sendJson(res, { success: true, message: 'Ad updated successfully' });
		})
	);

	app.delete(
		'/api/bank/ads/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const id = p(req, 'id');
			if (!UUID_RE.test(id)) return sendJson(res, { error: 'Invalid ad ID format' }, 400);

			const [existing] = await db.select().top(1).from(ads).where(eq(ads.id, id));
			if (!existing) return sendJson(res, { error: 'Ad not found' }, 404);

			await unlinkMediaUrl(existing.image);
			await unlinkMediaUrl(existing.video);
			await db.delete(adBranches).where(eq(adBranches.adId, id));
			await db.delete(ads).where(eq(ads.id, id));
			sendJson(res, { success: true, message: 'Ad deleted successfully' });
		})
	);
}
