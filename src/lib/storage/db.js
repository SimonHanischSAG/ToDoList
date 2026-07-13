/**
 * Lokale Datenbank (IndexedDB via Dexie.js)
 *
 * Dient als lokaler Cache für die Todos – ermöglicht:
 * - Offline-Nutzung (App funktioniert ohne Internet)
 * - Schnelle Lesezugriffe ohne Graph-API-Calls
 * - Sync-Queue für fehlgeschlagene OneDrive-Uploads
 */

import Dexie from 'dexie';

export const db = new Dexie('IBMTodoApp');

db.version(1).stores({
	// tasks: id als Primary Key, indizierte Felder für schnelle Filter/Sortierung
	tasks: 'id, status, priority, area, customer, dueDate, score, updatedAt',
	// syncQueue: ausstehende Uploads nach OneDrive
	syncQueue: '++id, timestamp'
});
