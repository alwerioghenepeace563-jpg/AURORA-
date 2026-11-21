import { readStoredJson, isRecord } from "./aurora-storage-guard.js";
export const AURORA_WATCHTOWER_KEY = "aurora-watchtower-monitors-v1";
const MAX_MONITORS = 100;
const INTERVALS = [1, 3, 6, 12, 24];
function validMonitor(item) {
  return isRecord(item) && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 80 &&
    typeof item.title === "string" && item.title.length > 0 && item.title.length <= 120 &&
    typeof item.query === "string" && item.query.length <= 500 && typeof item.category === "string" &&
    (item.sourceUrl === "" || (typeof item.sourceUrl === "string" && /^https:\/\//i.test(item.sourceUrl))) &&
    INTERVALS.includes(item.intervalHours) && ["active", "paused"].includes(item.status) &&
    Number.isSafeInteger(item.createdAt) && Number.isSafeInteger(item.nextCheckAt) &&
    (item.lastCheckedAt === null || Number.isSafeInteger(item.lastCheckedAt)) && item.notifications === true;
}
export function createAuroraWatchtower(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const now = options.now || (() => Date.now());
  const createId = options.createId || (() => "watch-" + (globalThis.crypto?.randomUUID?.() || now().toString(36)));
  function read() {
    return readStoredJson(storage, AURORA_WATCHTOWER_KEY, [], value => Array.isArray(value) && value.length <= MAX_MONITORS && value.every(validMonitor), "AURORA Watchtower monitors");
  }
  function write(items) {
    if (!storage?.setItem) throw new Error("Watchtower storage is unavailable.");
    if (items.length > MAX_MONITORS) throw new Error("Watchtower supports up to 100 monitors.");
    storage.setItem(AURORA_WATCHTOWER_KEY, JSON.stringify(items));
  }
  function list() {
    const current = now();
    return read().map(item => Object.freeze({ ...item, due: item.status === "active" && item.nextCheckAt <= current })).sort((a,b)=>a.nextCheckAt-b.nextCheckAt);
  }
  function create(input = {}) {
    if (input.approved !== true) throw Object.assign(new Error("Explicit permission is required before creating a monitor."), { code: "APPROVAL_REQUIRED" });
    const title = String(input.title || "").trim().slice(0,120), query = String(input.query || title).trim().slice(0,500);
    const category = String(input.category || "general").trim().slice(0,40), sourceUrl = String(input.sourceUrl || "").trim();
    const intervalHours = Number(input.intervalHours);
    if (!title || !query) throw new Error("A monitor name and topic are required.");
    if (!INTERVALS.includes(intervalHours)) throw new Error("Choose a check interval of 1, 3, 6, 12 or 24 hours.");
    if (sourceUrl) { let url; try { url = new URL(sourceUrl); } catch { throw new Error("Enter a valid HTTPS source URL."); } if (url.protocol !== "https:") throw new Error("Only HTTPS source URLs are accepted."); }
    const items = read(); if (items.length >= MAX_MONITORS) throw new Error("Watchtower supports up to 100 monitors.");
    const current = now(), record = { id:String(createId()), title, query, category, sourceUrl, intervalHours, status:"active", createdAt:current, lastCheckedAt:null, nextCheckAt:current+intervalHours*3600000, notifications:true };
    write([record,...items]); return Object.freeze({ ...record, due:false });
  }
  function update(id, patch = {}) {
    const items=read(), index=items.findIndex(item=>item.id===String(id)); if(index<0) throw new Error("Monitor not found.");
    const previous=items[index], status=patch.status===undefined?previous.status:patch.status;
    const intervalHours=patch.intervalHours===undefined?previous.intervalHours:Number(patch.intervalHours);
    if(!["active","paused"].includes(status)||!INTERVALS.includes(intervalHours)) throw new Error("Invalid monitor settings.");
    const next={...previous,status,intervalHours}; if(status==="active"&&previous.status==="paused") next.nextCheckAt=now()+intervalHours*3600000;
    items[index]=next; write(items); return Object.freeze({...next});
  }
  function markChecked(id) {
    const items=read(), index=items.findIndex(item=>item.id===String(id)); if(index<0) throw new Error("Monitor not found.");
    const current=now(); items[index]={...items[index],lastCheckedAt:current,nextCheckAt:current+items[index].intervalHours*3600000}; write(items); return Object.freeze({...items[index]});
  }
  function remove(id) { const items=read(), next=items.filter(item=>item.id!==String(id)); if(next.length===items.length)return false; write(next); return true; }
  return Object.freeze({list,create,update,markChecked,remove});
}
