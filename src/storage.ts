import { openDB } from "idb";
import type { StudyState } from "./types";
let database: ReturnType<typeof openDB> | undefined;
const db = () =>
  (database ??= openDB("insurance-15day-v1", 1, {
    upgrade(db) {
      db.createObjectStore("state");
    },
  }));
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("insurance-study-state")
    : null;
export async function loadState() {
  return (await db()).get("state", "main") as Promise<StudyState | undefined>;
}
export async function saveTransaction(
  f: (s: StudyState) => StudyState,
  fallback: StudyState,
) {
  const database = await db();
  const tx = database.transaction("state", "readwrite");
  const latest: StudyState = (await tx.store.get("main")) ?? fallback;
  const result = f(structuredClone(latest));
  result.revision = latest.revision + 1;
  await tx.store.put(result, "main");
  await tx.done;
  channel?.postMessage(result.revision);
  return result;
}
export function subscribe(fn: () => void) {
  if (!channel) return () => {};
  const handle = () => fn();
  channel.addEventListener("message", handle);
  return () => channel.removeEventListener("message", handle);
}
export async function backupState(s: StudyState) {
  await (await db()).put("state", s, "backup-" + new Date().toISOString());
}
export function downloadState(s: StudyState, suffix = "") {
  const blob = new Blob(
    [JSON.stringify({ ...s, exportedAt: new Date().toISOString() }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `保險通關紀錄-${new Date().toISOString().slice(0, 10)}${suffix}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
