import { asc, eq, inArray } from 'drizzle-orm';
import { UUID_RE, uuidV7 } from './ids';
import { db } from './db';
import { branches, queueBranches, queues, subMenuItems, subSubMenuItems } from './db/schema';

export async function listQueuesNested(branchId?: string) {
	const queueRows = await db.select().from(queues).orderBy(asc(queues.createdAt));
	const subRows = await db.select().from(subMenuItems).orderBy(asc(subMenuItems.createdAt));
	const subSubRows = await db.select().from(subSubMenuItems).orderBy(asc(subSubMenuItems.createdAt));
	const linkRows = await db.select().from(queueBranches);

	const subSubsByParent = new Map<string, typeof subSubRows>();
	for (const row of subSubRows) {
		const list = subSubsByParent.get(row.subMenuItemId) ?? [];
		list.push(row);
		subSubsByParent.set(row.subMenuItemId, list);
	}

	const subsByQueue = new Map<string, typeof subRows>();
	for (const row of subRows) {
		const list = subsByQueue.get(row.queueId) ?? [];
		list.push(row);
		subsByQueue.set(row.queueId, list);
	}

	const branchIdsByQueue = new Map<string, string[]>();
	for (const link of linkRows) {
		const list = branchIdsByQueue.get(link.queueId) ?? [];
		list.push(link.branchId);
		branchIdsByQueue.set(link.queueId, list);
	}

	const nested = queueRows.map((queue) => ({
		id: queue.id,
		status: queue.status ?? 1,
		branchIds: branchIdsByQueue.get(queue.id) ?? [],
		menuItem: {
			name: queue.name,
			subMenuItems: (subsByQueue.get(queue.id) ?? []).map((subItem) => ({
				id: subItem.id,
				name: subItem.name,
				priority: !!subItem.priority,
				subSubMenuItems: (subSubsByParent.get(subItem.id) ?? []).map((subSubItem) => ({
					id: subSubItem.id,
					name: subSubItem.name,
					priority: !!subSubItem.priority
				}))
			}))
		},
		createdAt: queue.createdAt,
		updatedAt: queue.updatedAt
	}));

	if (!branchId) return nested;
	return nested.filter(
		(queue) => queue.branchIds.length === 0 || queue.branchIds.includes(branchId)
	);
}

export function parseQueueBranchIds(
	raw: unknown
): { ok: true; ids: string[] } | { ok: false; error: string } {
	if (!Array.isArray(raw)) return { ok: false, error: 'At least one branch is required' };
	const ids = [...new Set(raw.map(String))];
	if (!ids.length) return { ok: false, error: 'At least one branch is required' };
	if (ids.length > 100) return { ok: false, error: 'Too many branch IDs (maximum 100)' };
	for (const id of ids) {
		if (!UUID_RE.test(id)) return { ok: false, error: 'Invalid branch ID format' };
	}
	return { ok: true, ids };
}

export async function branchesExist(ids: string[]) {
	if (!ids.length) return false;
	const rows = await db.select({ id: branches.id }).from(branches).where(inArray(branches.id, ids));
	return rows.length === ids.length;
}

export async function replaceQueueBranches(queueId: string, branchIds: string[]) {
	await db.delete(queueBranches).where(eq(queueBranches.queueId, queueId));
	if (!branchIds.length) return;
	await db.insert(queueBranches).values(
		branchIds.map((branchId) => ({
			id: uuidV7(),
			queueId,
			branchId
		}))
	);
}

export async function deleteQueueBranches(queueId: string) {
	await db.delete(queueBranches).where(eq(queueBranches.queueId, queueId));
}

export async function getQueueName(id: string) {
	const [row] = await db.select({ name: queues.name }).top(1).from(queues).where(eq(queues.id, id));
	return row?.name ?? '';
}
