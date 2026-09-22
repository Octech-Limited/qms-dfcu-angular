import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { db } from './db';
import { ads, adBranches } from './db/schema';
import { logger } from './logger';
import { eatNow } from './timezone';
import { EXPIRED_AD_RETENTION_DAYS } from './adsConstants';

export { EXPIRED_AD_RETENTION_DAYS };

async function unlinkAdMedia(ad: { image: string | null; video: string | null }) {
	if (ad.image) {
		const imagePath = path.join(process.cwd(), 'uploads', path.basename(ad.image));
		try {
			await unlink(imagePath);
		} catch (error) {
			logger.warn('Failed to delete image file during ad cleanup:', error);
		}
	}
	if (ad.video) {
		const videoPath = path.join(process.cwd(), 'uploads', path.basename(ad.video));
		try {
			await unlink(videoPath);
		} catch (error) {
			logger.warn('Failed to delete video file during ad cleanup:', error);
		}
	}
}

/** Hard-deletes ads whose validUntil is older than EXPIRED_AD_RETENTION_DAYS. */
export async function purgeAdsExpiredOver30Days(): Promise<number> {
	const cutoff = eatNow();
	cutoff.setUTCDate(cutoff.getUTCDate() - EXPIRED_AD_RETENTION_DAYS);

	const expiredAds = await db
		.select()
		.from(ads)
		.where(and(isNotNull(ads.validUntil), lt(ads.validUntil, cutoff)));

	if (expiredAds.length === 0) return 0;

	let deletedCount = 0;
	for (const ad of expiredAds) {
		try {
			await unlinkAdMedia(ad);
			await db.delete(adBranches).where(eq(adBranches.adId, ad.id));
			await db.delete(ads).where(eq(ads.id, ad.id));
			deletedCount += 1;
		} catch (error) {
			logger.error(`Failed to purge expired ad ${ad.id}:`, error);
		}
	}

	if (deletedCount > 0) {
		logger.info(
			`[Ads cleanup] Purged ${deletedCount} ad(s) expired before ${cutoff.toISOString()}`
		);
	}
	return deletedCount;
}
