import { sfx } from '../audio.ts';
import { h, toast } from './dom.ts';

/** Modal shown while waiting for an opponent in a private room or the quick-match queue. */
export class WaitingDialog {
  readonly el: HTMLElement;
  private readonly body = h('div', { class: 'panel dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wait-title' });
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly onCancel: () => void;

  constructor(onCancel: () => void) {
    this.onCancel = onCancel;
    this.el = h('div', { class: 'overlay hidden' }, this.body);
  }

  showRoom(code: string): void {
    clearInterval(this.timer);
    const copy = h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(code);
          toast('Kode room disalin.', 'info');
        } catch {
          toast('Tidak bisa menyalin otomatis. Salin kodenya secara manual.');
        }
      },
    }, 'Salin kode');
    this.body.replaceChildren(
      h('h2', { class: 'panel-title', id: 'wait-title' }, 'Private room'),
      h('p', { class: 'subtitle', style: 'margin:0' }, 'Bagikan kode ini ke temanmu'),
      h('div', { class: 'room-code' }, code),
      h('div', { class: 'spinner', 'aria-hidden': 'true' }),
      h('p', { class: 'subtitle' }, 'Menunggu lawan bergabung…'),
      copy,
      this.cancelButton(),
    );
    this.el.classList.remove('hidden');
  }

  showQueue(): void {
    const started = performance.now();
    const elapsed = h('span', {}, '0s');
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      elapsed.textContent = `${Math.floor((performance.now() - started) / 1000)}s`;
    }, 500);
    this.body.replaceChildren(
      h('h2', { class: 'panel-title', id: 'wait-title' }, 'Quick Match'),
      h('div', { class: 'spinner', 'aria-hidden': 'true' }),
      h('p', { class: 'subtitle' }, 'Mencari lawan… ', elapsed),
      this.cancelButton(),
    );
    this.el.classList.remove('hidden');
  }

  hide(): void {
    clearInterval(this.timer);
    this.el.classList.add('hidden');
  }

  private cancelButton(): HTMLButtonElement {
    return h('button', {
      class: 'btn',
      type: 'button',
      onclick: () => {
        sfx.play('click');
        this.onCancel();
      },
    }, 'Batal');
  }
}
