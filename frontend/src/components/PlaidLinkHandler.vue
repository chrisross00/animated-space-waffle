<template>
  <div>
    <button ref="plaidLinkButton" style="display: none;"></button>
  </div>
</template>

<script>
import { getOrAddUserAccount }  from '@/firebase'

export default {
  props: {},
  data() {
    return {
      linkHandler: null
    };
  },
  methods: {
    async createLinkToken() {
      const res = await fetch("/plaid-api/create_link_token");
      const data = await res.json();
      const linkToken = data.link_token;
      return linkToken;
    },
    async initializePlaid() {
      console.log('initializing plaid')
      // call get Or Add User

      const linkToken = await this.createLinkToken();
      this.linkHandler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          const response = await getOrAddUserAccount(publicToken, metadata)
          if (response.ok) {
            console.log("Public token exchanged successfully.");
          } else {
            console.error("Error exchanging public token:", response.status);
          }
          this.$emit("onPlaidSuccess", publicToken, metadata);
        },
        onEvent: (eventName, metadata) => {
          console.log("Event:", eventName);
          console.log("Metadata:", metadata);
        },
        onExit: (error, metadata) => {
          console.log(error, metadata);
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
