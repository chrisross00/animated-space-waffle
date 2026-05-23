<template>
  <div></div>
</template>

<script>
import { storeEnrollment } from '@/api';

let scriptPromise = null;
function loadTellerConnect() {
  if (window.TellerConnect) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.teller.io/connect/connect.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load Teller Connect'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default {
  props: {
    // When set, opens Connect in reconnect (update) mode for an existing enrollment.
    reconnectEnrollmentId: { type: String, default: null },
  },
  data() {
    return { connect: null };
  },
  async mounted() {
    try {
      await loadTellerConnect();
    } catch (e) {
      console.error('BankLinkHandler:', e.message);
      this.$emit('onBankExit');
      return;
    }
    this.connect = window.TellerConnect.setup({
      applicationId: import.meta.env.VITE_TELLER_APPLICATION_ID,
      environment: import.meta.env.VITE_TELLER_ENVIRONMENT,
      products: ['transactions', 'balance'],
      ...(this.reconnectEnrollmentId ? { enrollmentId: this.reconnectEnrollmentId } : {}),
      onSuccess: async (tellerResult) => {
        // Reconnect mode: credentials already refreshed, just tell the parent.
        if (this.reconnectEnrollmentId) {
          this.$emit('onBankSuccess', tellerResult);
          return;
        }
        // Only signal success if the enrollment actually persisted server-side.
        const stored = await storeEnrollment(tellerResult);
        if (stored !== null) this.$emit('onBankSuccess', tellerResult);
      },
      onExit: () => this.$emit('onBankExit'),
    });
    this.connect.open();
  },
};
</script>
