// Switching Moonraker power devices, shared by the top bar menu and the dashboard card.
// Turning something off while printing (or a device Moonraker locks during prints) asks first;
// the question is shown by the top bar, which is always on screen.
import { ref } from 'vue'
import { setPower, isPrinting, toast } from './store'
export const powerAsk = ref(null)
export const powerBusy = ref('')
export async function flipPower(d, want, confirmed = false) {
  if (!want && !confirmed && (isPrinting.value || d.locked_while_printing)) { powerAsk.value = d; return }
  powerAsk.value = null
  powerBusy.value = d.device
  try { await setPower(d.device, want ? 'on' : 'off') } catch (e) { toast(e.message, 'error') }
  powerBusy.value = ''
}
