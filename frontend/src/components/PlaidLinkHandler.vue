<template>
  <div>
    <button ref="plaidLinkButton" style="display: none;"></button>
  </div>
</template>

<script>
import { getOrAddUserAccount, getAuthHeaders }  from '@/api'

export default {
  props: {
    linkToken: { type: String, default: null },
  },
  data() {
    return {
      linkHandler: null
    };
  },
  methods: {
    async createLinkToken() {
      const headers = await getAuthHeaders();
      const res = await fetch("/plaid-api/create_link_token", { headers });
      const data = await res.json();
      const linkToken = data.link_token;
      return linkToken;
    },
    async initializePlaid() {
      const linkToken = this.linkToken || await this.createLinkToken();
      this.linkHandler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          // Update mode (reconnect) — no token exchange needed, Plaid already
          // updated the credentials. Just emit success so the caller can sync.
          if (this.linkToken) {
            this.$emit("onPlaidSuccess", publicToken, metadata);
            return;
          }
          await getOrAddUserAccount(publicToken, metadata);
          this.$emit("onPlaidSuccess", publicToken, metadata);
        },
        onEvent: () => {},
        onExit: (error) => {
          if (error) console.error('Plaid Link exit error:', error.error_code);
          this.$emit('onPlaidExit');
        },
      });
      this.linkHandler.open();
    },
  },
  mounted() {
    this.initializePlaid();
  },
};
</script>
