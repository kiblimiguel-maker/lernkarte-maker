export const plainRecord = value => value && typeof value === 'object' && !Array.isArray(value);

export function sameRecord(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && sameRecord(left[key], right[key]));
}

// Store only the changed slice of large session arrays between successive
// answers. The complete first/last versions still allow an exact comparison.
const sessionArrays = ['cardIds', 'results', 'historyCardIds', 'shuffleRemainingCardIds', 'missedCardIdsCopied'];
export function previousSessionStep(after, previous) {
  const record = { ...previous }, edits = {};
  for (const key of sessionArrays) {
    const source = after[key], target = previous[key];
    if (!Array.isArray(source) || !Array.isArray(target)) continue;
    delete record[key];
    let start = 0;
    const length = Math.min(source.length, target.length);
    while (start < length && sameRecord(source[start], target[start])) start++;
    let tail = 0;
    while (tail < length - start && sameRecord(source[source.length - tail - 1], target[target.length - tail - 1])) tail++;
    edits[key] = start === source.length && start === target.length ? null
      : [start, source.length - start - tail, target.slice(start, target.length - tail)];
  }
  return { record, edits };
}

function validSessionStep(step, setId) {
  return plainRecord(step?.record) && typeof step.record.id === 'string' && step.record.setId === setId &&
    plainRecord(step.edits) && Object.entries(step.edits).every(([key, edit]) => sessionArrays.includes(key) &&
      (edit === null || (Array.isArray(edit) && edit.length === 3 && Number.isSafeInteger(edit[0]) && edit[0] >= 0 &&
        Number.isSafeInteger(edit[1]) && edit[1] >= 0 && Array.isArray(edit[2]))));
}

export function matchesPreviousSession(current, after, steps) {
  if (!current || !steps) return false;
  let version = after;
  for (const { record, edits } of steps) {
    const previous = { ...record };
    for (const [key, edit] of Object.entries(edits)) {
      const array = version[key];
      if (!Array.isArray(array) || (edit && edit[0] + edit[1] > array.length)) return false;
      previous[key] = edit ? array.slice(0, edit[0]).concat(edit[2], array.slice(edit[0] + edit[1])) : array;
    }
    if (sameRecord(current, previous)) return true;
    version = previous;
  }
  return false;
}

// Recovery drafts may outlive the version of the app that created them.
export function validStoredChange(table, change) {
  if (!plainRecord(change) || (change.before !== null && !plainRecord(change.before)) ||
      typeof change.after?.id !== 'string') return false;
  const session = table === 'studySessions';
  if (session && typeof change.after.setId !== 'string') return false;
  if (change.sessionSteps !== undefined && (!session || !Array.isArray(change.sessionSteps) ||
      !change.sessionSteps.every(step => validSessionStep(step, change.after.setId)))) return false;
  if (change.intermediate === undefined) return true;
  return Array.isArray(change.intermediate) && change.intermediate.every(record =>
    plainRecord(record) && (session ? record.setId === change.after.setId : record.id === change.after.id));
}
