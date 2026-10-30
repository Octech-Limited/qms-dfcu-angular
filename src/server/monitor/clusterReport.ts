import { clusterCollect, onClusterRequest } from '../cluster';
import { getLocalReport, type LocalReport, type RingEvent } from './collector';
import { aggregate, mergeByMinute, type Snapshot } from './store';

onClusterRequest('monitor-report', (args) => getLocalReport(Number((args as { windowMin?: number })?.windowMin) || 15));

interface WorkerLive {
	slot: string | null;
	pid: number;
	uptimeSec: number;
	inflight: number;
	pool: LocalReport['live']['pool'];
}

export interface ClusterReport {
	snapshot: Snapshot;
	rings: { errors: RingEvent[]; slowRequests: RingEvent[]; slowQueries: RingEvent[] };
	live: LocalReport['live'] & { workers: WorkerLive[] };
}

function mergeRing(reports: LocalReport[], key: keyof LocalReport['rings']): RingEvent[] {
	return reports
		.flatMap((r) => r.rings[key].map((e) => ({ ...e, worker: r.slot })))
		.sort((a, b) => b.t - a.t)
		.slice(0, 300);
}

/** One view over every worker (or just this process when not clustered / if the others don't answer). */
export async function getClusterReport(windowMin: number): Promise<ClusterReport> {
	let reports = await clusterCollect<LocalReport>('monitor-report', { windowMin });
	reports = reports.filter((r): r is LocalReport => !!r && Array.isArray(r.buckets));
	if (!reports.length) reports = [getLocalReport(windowMin)];
	reports.sort((a, b) => String(a.slot).localeCompare(String(b.slot), undefined, { numeric: true }));

	const workers: WorkerLive[] = reports.map((r) => ({
		slot: r.slot, pid: r.live.pid, uptimeSec: r.live.uptimeSec, inflight: r.live.inflight, pool: r.live.pool
	}));
	const pools = workers.map((w) => w.pool).filter((p): p is NonNullable<typeof p> => !!p);
	const sum = (pick: (p: NonNullable<typeof pools[number]>) => number) => pools.reduce((n, p) => n + pick(p), 0);
	const self = reports.find((r) => r.live.pid === process.pid) ?? reports[0];

	return {
		snapshot: aggregate(mergeByMinute(reports.flatMap((r) => r.buckets)), windowMin),
		rings: {
			errors: mergeRing(reports, 'errors'),
			slowRequests: mergeRing(reports, 'slowRequests'),
			slowQueries: mergeRing(reports, 'slowQueries')
		},
		live: {
			...self.live,
			uptimeSec: Math.min(...workers.map((w) => w.uptimeSec)),
			inflight: workers.reduce((n, w) => n + w.inflight, 0),
			pool: pools.length
				? {
						connected: pools.some((p) => p.connected),
						size: sum((p) => p.size),
						available: sum((p) => p.available),
						pending: sum((p) => p.pending),
						borrowed: sum((p) => p.borrowed),
						max: sum((p) => p.max)
					}
				: null,
			workers
		}
	};
}
