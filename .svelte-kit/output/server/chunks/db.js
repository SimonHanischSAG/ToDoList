import Dexie from "dexie";
const db = new Dexie("IBMTodoApp");
db.version(1).stores({
  // tasks: id als Primary Key, indizierte Felder für schnelle Filter/Sortierung
  tasks: "id, status, priority, area, customer, dueDate, score, updatedAt",
  // syncQueue: ausstehende Uploads nach OneDrive
  syncQueue: "++id, timestamp"
});
