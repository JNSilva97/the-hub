// Keep the native select as the data source; all visible choices stay inside The Hub.
function createChecklistPicker(select) {
  const container = document.createElement('div');
  container.id = select.id + '-menu';
  container.className = 'checklist-picker' + (select.classList.contains('routine-picker') ? ' routine-picker' : '');
  select.classList.remove('routine-picker');
  select.classList.add('checklist-native');
  select.hidden = true;
  select.after(container);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'checklist-picker-toggle';
  const choices = document.createElement('div');
  choices.id = select.id + '-choices';
  choices.className = 'checklist-picker-choices';
  choices.hidden = true;
  choices.setAttribute('role', 'group');
  const label = select.getAttribute('aria-label') || 'Choose checklist';
  choices.setAttribute('aria-label', label);
  trigger.setAttribute('aria-controls', choices.id);
  trigger.setAttribute('aria-expanded', 'false');
  container.append(trigger, choices);
  const disabled = () => select.matches(':disabled') || !select.options.length;
  const dialog = select.closest('dialog');
  function close(restoreFocus = false) {
    choices.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !disabled()) trigger.focus({ preventScroll: true });
  }
  function refresh() {
    trigger.textContent = select.selectedOptions[0]?.textContent || 'Choose checklist';
    trigger.setAttribute('aria-label', label + ': ' + trigger.textContent);
    trigger.disabled = disabled();
    const buttons = [...select.options].map(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'checklist-choice';
      button.dataset.value = option.value;
      button.textContent = option.textContent;
      button.disabled = option.disabled;
      button.setAttribute('aria-pressed', String(option.selected));
      button.addEventListener('click', () => {
        if (disabled()) return;
        close(true);
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return button;
    });
    choices.replaceChildren(...buttons);
    if (disabled()) close();
  }
  function open() {
    if (disabled()) return;
    refresh();
    choices.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const anchor = trigger.getBoundingClientRect();
    const bounds = dialog?.getBoundingClientRect();
    const header = dialog?.querySelector('.routines-header')?.getBoundingClientRect();
    const ceiling = Math.max(bounds?.top || 0, header?.bottom || 0) + 8;
    const floor = Math.min(window.innerHeight, bounds?.bottom || window.innerHeight) - 8;
    const below = floor - anchor.bottom - 6;
    const above = anchor.top - ceiling - 6;
    const side = below < 144 && above > below ? 'above' : 'below';
    choices.dataset.side = side;
    choices.style.maxHeight = `${Math.max(48, Math.min(320, side === 'above' ? above : below))}px`;
  }
  trigger.addEventListener('click', () => { if (choices.hidden) open(); else close(); });
  container.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !choices.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || disabled()) return;
    event.preventDefault();
    const wasClosed = choices.hidden;
    if (wasClosed) open();
    const buttons = [...choices.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) return;
    let index = buttons.indexOf(document.activeElement);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else if (wasClosed) index = Math.max(0, buttons.findIndex(button => button.dataset.value === select.value));
    else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].focus();
  }, true);
  document.addEventListener('pointerdown', event => { if (!container.contains(event.target)) close(); });
  container.addEventListener('focusout', event => { if (!container.contains(event.relatedTarget)) close(); });
  select.addEventListener('change', refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(select, { childList: true, subtree: true, characterData: true, attributes: true });
  const fieldset = select.closest('fieldset');
  if (fieldset) observer.observe(fieldset, { attributes: true, attributeFilter: ['disabled'] });
  dialog?.addEventListener('close', () => close());
  window.addEventListener('resize', () => close());
  refresh();
  return { refresh, close, focus: () => trigger.focus() };
}

