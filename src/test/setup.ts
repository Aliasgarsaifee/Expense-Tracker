// Provides a real-in-memory IndexedDB (indexedDB, IDBKeyRange, ...) as
// globals so Dexie runs unmodified under Node in tests.
import 'fake-indexeddb/auto'
