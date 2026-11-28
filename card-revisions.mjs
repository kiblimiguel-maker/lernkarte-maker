import { sameRecord } from './recovery-versions.mjs';

const textKeys = ['front', 'back', 'frontExampleSentence', 'backExampleSentence'];
const sameText = (left, right) => textKeys.every(key => (left[key] ?? '') === (right[key] ?? ''));

function copyField(target, source, key) {
  if (Object.hasOwn(source, key)) target[key] = source[key];
  else delete target[key];
}

// Text and examples form a single version on screen. A text choice must never
// undo compatible progress or position changes made on another device.
export function reconcileCardRevision(before, local, remote, choice) {
  if (!before || !remote || before.id !== local.id || before.id !== remote.id ||
      before.setId !== local.setId || before.setId !== remote.setId) return null;
  const merged = { ...remote };
  for (const key of new Set([...Object.keys(before), ...Object.keys(local)])) {
    if (textKeys.includes(key) || key === 'updatedAt' || sameRecord(before[key], local[key])) continue;
    if (!sameRecord(remote[key], before[key]) && !sameRecord(remote[key], local[key])) return null;
    copyField(merged, local, key);
  }
  if (!sameText(local, before) && !sameText(local, remote)) {
    if (!sameText(remote, before) && (!sameRecord(choice?.remote, remote) || !['local', 'remote'].includes(choice?.source))) {
      return { conflict: { local, remote } };
    }
    if (sameText(remote, before) || choice?.source === 'local') {
      for (const key of textKeys) copyField(merged, local, key);
    }
  }
  if (!sameRecord(merged, remote) && Date.parse(local.updatedAt) > (Date.parse(remote.updatedAt) || 0)) {
    merged.updatedAt = local.updatedAt;
  }
  return { merged };
}
