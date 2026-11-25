import assert from 'node:assert/strict';
import { bindExamDateInput, formatExamDateInput, parseExamDateInput } from './exam-date.mjs';

for (const [raw, expected] of [
  ['2027-01-15', '2027-01-15'], ['15.01.2027', '2027-01-15'],
  ['1.2.2027', '2027-02-01'], [' 1 . 2 . 2027 ', '2027-02-01'],
  ['25112026', '2026-11-25'], ['01022027', '2027-02-01'],
  ['29.02.2028', '2028-02-29'], ['29.02.2000', '2000-02-29'],
  ['2026-03-29', '2026-03-29'], ['25.10.2026', '2026-10-25'],
  ['01.01.0001', '0001-01-01'], ['31.12.9999', '9999-12-31']
]) assert.equal(parseExamDateInput(raw), expected, raw);

for (const raw of [
  '', '   ', null, undefined, 20270115, {}, '15.01.27',
  '15/01/2027', '01-15-2027', '2027-1-15', '2027-01-15T00:00:00Z',
  '31.02.2027', '29.02.2027', '29.02.1900', '31.04.2027',
  '0.1.2027', '1.0.2027', '1.13.2027', '32.1.2027', '1.1.0000',
  '1.1.10000', '31022027', '0101202', '20270115', '2027-01-15 junk', '<script>2027-01-15</script>'
]) assert.equal(parseExamDateInput(raw), '', String(raw));

assert.equal(formatExamDateInput('2027-01-15'), '15.01.2027');
assert.equal(formatExamDateInput('1.2.2027'), '01.02.2027');
assert.equal(formatExamDateInput('25112026'), '25.11.2026');
assert.equal(formatExamDateInput('0001-01-01'), '01.01.0001');
assert.equal(formatExamDateInput('2027-02-31'), '');

class Input extends EventTarget {
  constructor(value = '') { super(); this.value = value; this.message = ''; this.attributes = new Map(); }
  setCustomValidity(message) { this.message = message; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  emit(name) { this.dispatchEvent(new Event(name)); }
}

const input = new Input('15.01.2027'), picker = new Input();
const binding = bindExamDateInput({ querySelector: selector => selector === '#exam-date' ? input : picker });
assert.equal(picker.value, '2027-01-15', 'editing initializes the native calendar from the displayed date');
assert.equal(binding.read(), '2027-01-15');

input.value = '1.2.2027'; input.emit('input');
assert.equal(picker.value, '2027-02-01');
assert.equal(input.value, '1.2.2027', 'typing is not reformatted while the user is editing');
input.emit('blur');
assert.equal(input.value, '01.02.2027');
assert.equal(binding.validate(), true);

input.value = '25112026'; input.emit('input'); input.emit('blur');
assert.equal(input.value, '25.11.2026', 'digits-only mobile typing formats after blur');
assert.equal(picker.value, '2026-11-25');

input.value = '31.02.2027'; input.emit('input'); input.emit('blur');
assert.equal(input.value, '31.02.2027', 'invalid text remains available to correct');
assert.equal(picker.value, '', 'invalid text never keeps a stale selected date');
assert.equal(binding.read(), '');
assert.equal(binding.validate(), false);
assert.match(input.message, /TT\.MM\.JJJJ/);
assert.equal(input.attributes.get('aria-invalid'), 'true');

input.value = '29.02.2028'; input.emit('input');
assert.equal(input.message, '', 'typing clears a previous custom validation error');
assert.equal(input.attributes.has('aria-invalid'), false);
assert.equal(picker.value, '2028-02-29');
assert.equal(binding.validate(), true);

input.value = 'bad'; input.emit('blur');
picker.value = '2027-01-16'; picker.emit('change');
assert.equal(input.value, '16.01.2027');
assert.equal(input.message, '', 'a calendar selection clears the old manual error');
assert.equal(input.attributes.has('aria-invalid'), false);
assert.equal(binding.read(), '2027-01-16');

picker.value = '2027-02-02'; picker.emit('input');
assert.equal(input.value, '02.02.2027', 'native input events update the visible field immediately');
picker.value = ''; picker.emit('change');
assert.equal(input.value, ''); assert.equal(binding.read(), '');
assert.equal(binding.validate(), false); assert.match(input.message, /Testdatum/);
input.emit('input'); input.emit('blur');
assert.equal(input.message, '', 'an empty blurred field leaves required validation to the form');
assert.equal(input.attributes.has('aria-invalid'), false);

binding.dispose();
input.value = '15.01.2027'; input.emit('input');
assert.equal(picker.value, '', 'disposing removes the input listeners');
assert.throws(() => bindExamDateInput({ querySelector: () => null }), /Datumsfelder/);

console.log('Exam date input checks passed: Swiss and ISO dates, leap years, invalid input, typed/calendar synchronization and validation recovery.');
