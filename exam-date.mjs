const invalidDateMessage = 'Gib ein gültiges Datum im Format TT.MM.JJJJ ein, z. B. 15.01.2027.';

// Parse calendar components directly. Date parsing must not roll an invalid day
// into the next month or shift a date because of the device's time zone.
export function parseExamDateInput(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/.exec(text);
  const compact = /^(\d{2})(\d{2})(\d{4})$/.exec(text);
  const swiss = local || compact;
  if (!iso && !swiss) return '';
  const year = Number(iso ? iso[1] : swiss[3]);
  const month = Number(iso ? iso[2] : swiss[2]);
  const day = Number(iso ? iso[3] : swiss[1]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return '';
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > monthDays[month - 1]) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatExamDateInput(value) {
  const iso = parseExamDateInput(value);
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
}

/** Bind a plain keyboard field to the browser's existing native date picker. */
export function bindExamDateInput(root) {
  const input = root.querySelector('#exam-date');
  const picker = root.querySelector('#exam-date-picker');
  if (!input || !picker) throw new Error('Die Datumsfelder fehlen im Testformular.');

  function clearError() {
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
  }

  function syncTypedValue() {
    clearError();
    picker.value = parseExamDateInput(input.value);
  }

  function validate() {
    const iso = parseExamDateInput(input.value);
    if (!iso) {
      picker.value = '';
      input.setCustomValidity(input.value.trim() ? invalidDateMessage : 'Bitte gib das Testdatum ein.');
      input.setAttribute('aria-invalid', 'true');
      return false;
    }
    clearError();
    picker.value = iso;
    input.value = formatExamDateInput(iso);
    return true;
  }

  function formatTypedValue() {
    if (!input.value.trim()) {
      clearError();
      picker.value = '';
      return;
    }
    validate();
  }

  function syncPickedValue() {
    input.value = formatExamDateInput(picker.value);
    clearError();
  }

  const listeners = [
    [input, 'input', syncTypedValue],
    [input, 'blur', formatTypedValue],
    [picker, 'input', syncPickedValue],
    [picker, 'change', syncPickedValue]
  ];
  for (const [element, event, handler] of listeners) element.addEventListener(event, handler);
  syncTypedValue();

  return {
    read: () => parseExamDateInput(input.value),
    validate,
    dispose() {
      for (const [element, event, handler] of listeners) element.removeEventListener(event, handler);
    }
  };
}
