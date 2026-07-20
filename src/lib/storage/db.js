/**
 * Local database (IndexedDB via Dexie.js)
 *
 * Acts as a local cache for todos – enables:
 * - Offline usage (app works without internet)
 * - Fast reads without API calls
 * - Sync queue for failed uploads
 */

import Dexie from 'dexie';

export const db = new Dexie('IBMTodoApp');

db.version(1).stores({
	// tasks: id as primary key, indexed fields for fast filtering/sorting
	tasks: 'id, status, priority, area, customer, dueDate, score, updatedAt',
	// syncQueue: pending uploads
	syncQueue: '++id, timestamp'
});
