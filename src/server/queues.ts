import { asc, eq } from 'drizzle-orm';
import { db } from './db';
import { queues, subMenuItems, subSubMenuItems } from './db/schema';

export async function listQueuesNested() {
	const queueRows = await db.select().from(queues).orderBy(asc(queues.createdAt));
	const subRows = await db.select().from(subMenuItems).orderBy(asc(subMenuItems.createdAt));
	const subSubRows = await db.select().from(subSubMenuItems).orderBy(asc(subSubMenuItems.createdAt));

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

	return queueRows.map((queue) => ({
		id: queue.id,
		status: queue.status ?? 1,
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
}

export async function getQueueName(id: string) {
	const [row] = await db.select({ name: queues.name }).top(1).from(queues).where(eq(queues.id, id));
	return row?.name ?? '';
}
