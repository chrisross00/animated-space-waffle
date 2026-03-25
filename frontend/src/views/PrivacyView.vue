<template>
  <div class="basil-privacy">
    <div class="basil-privacy__container">
      <h1 class="basil-privacy__title basil-display">Privacy Policy</h1>
      <p class="basil-privacy__effective">Effective date: March 11, 2026</p>

      <section class="basil-privacy__section">
        <h2>1. Introduction</h2>
        <p>
          Basil ("we," "our," or "us") is a personal finance application that helps
          users track spending, set budgets, and categorize transactions. This Privacy
          Policy describes how we collect, use, store, and protect your information
          when you use the Basil application (the "Service").
        </p>
        <p>
          By using the Service, you agree to the collection and use of information in
          accordance with this policy.
        </p>
      </section>

      <section class="basil-privacy__section">
        <h2>2. Information We Collect</h2>

        <h3>Account Information</h3>
        <p>
          When you create an account, we collect your name, email address, and profile
          picture as provided by your Google account through our authentication provider.
        </p>

        <h3>Financial Data</h3>
        <p>
          When you link a bank account through Plaid, Inc. ("Plaid"), we receive and
          store the following information:
        </p>
        <ul>
          <li>Transaction details (date, amount, merchant name, category)</li>
          <li>Account metadata (institution name, account type, account mask)</li>
          <li>Account balances</li>
        </ul>
        <p>
          We do not receive or store your bank login credentials. Authentication with
          your financial institution is handled entirely by Plaid. Plaid's use of your
          data is governed by the
          <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noopener">
            Plaid End User Privacy Policy</a>.
        </p>

        <h3>User-Generated Data</h3>
        <p>
          We store data you create within the Service, including budget categories,
          categorization rules, transaction notes, and any manual overrides you apply
          to your transactions.
        </p>
      </section>

      <section class="basil-privacy__section">
        <h2>3. How We Use Your Information</h2>
        <p>We use your information solely to provide and improve the Service:</p>
        <ul>
          <li>Display your transactions and account balances</li>
          <li>Categorize transactions based on your rules and preferences</li>
          <li>Generate budget summaries, charts, and spending insights</li>
          <li>Authenticate your identity and secure your account</li>
        </ul>
        <p>
          We do not sell, rent, or share your personal or financial information with
          third parties for marketing or advertising purposes. We do not use your
          data to build advertising profiles.
        </p>
      </section>

      <section class="basil-privacy__section">
        <h2>4. Data Storage and Security</h2>
        <p>
          Your data is stored in a secured database with access restricted to
          authenticated users. All communication between your browser and our servers
          is encrypted via HTTPS. Access to your financial data requires a valid
          authentication token, and all queries are scoped to your user account.
        </p>
        <p>
          While we implement reasonable security measures, no method of electronic
          storage or transmission is 100% secure. We cannot guarantee absolute security
          of your data.
        </p>
      </section>

      <section class="basil-privacy__section">
        <h2>5. Data Retention and Deletion</h2>
        <p>
          We retain your data for as long as your account is active. You may delete
          your account and all associated data at any time from the Profile page in
          the application. Upon deletion, we permanently remove all your transactions,
          categories, rules, and linked account information from our systems.
        </p>
      </section>

      <section class="basil-privacy__section">
        <h2>6. Third-Party Services</h2>
        <p>The Service integrates with the following third-party services:</p>
        <ul>
          <li>
            <strong>Plaid, Inc.</strong> — provides secure access to your financial
            institution data. See the
            <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noopener">
              Plaid End User Privacy Policy</a>.
          </li>
          <li>
            <strong>Google (via authentication provider)</strong> — provides sign-in
            services. See the
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">
              Google Privacy Policy</a>.
          </li>
        </ul>
      </section>

      <section class="basil-privacy__section">
        <h2>7. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access the personal and financial data we hold about you</li>
          <li>Delete your account and all associated data</li>
          <li>Disconnect linked bank accounts at any time</li>
          <li>Export your transaction data</li>
        </ul>
      </section>

      <section class="basil-privacy__section">
        <h2>8. Children's Privacy</h2>
        <p>
          The Service is not intended for use by anyone under the age of 18. We do
          not knowingly collect personal information from children.
        </p>
      </section>

      <section class="basil-privacy__section">
        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify users
          of material changes by updating the effective date at the top of this page.
          Continued use of the Service after changes constitutes acceptance of the
          updated policy.
        </p>
      </section>

      <section class="basil-privacy__section">
        <h2>10. Contact</h2>
        <p>
          If you have questions about this Privacy Policy or your data, contact us
          at <a href="mailto:privacy@trybasil.app">privacy@trybasil.app</a>.
        </p>
      </section>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PrivacyView',
}
</script>

<style scoped>
.basil-privacy {
  padding: var(--basil-space-5);
}

.basil-privacy__container {
  max-width: 680px;
  margin: 0 auto;
}

.basil-privacy__title {
  font-size: 2rem;
  color: var(--basil-text);
  margin: 0 0 var(--basil-space-2) 0;
}

.basil-privacy__effective {
  font-size: 0.875rem;
  color: var(--basil-text-muted);
  margin: 0 0 var(--basil-space-6) 0;
}

.basil-privacy__section {
  margin-bottom: var(--basil-space-6);
}

.basil-privacy__section h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--basil-text);
  margin: 0 0 var(--basil-space-3) 0;
}

.basil-privacy__section h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--basil-text);
  margin: var(--basil-space-4) 0 var(--basil-space-2) 0;
}

.basil-privacy__section p {
  font-size: 0.9375rem;
  color: var(--basil-text-secondary);
  line-height: 1.7;
  margin: 0 0 var(--basil-space-3) 0;
}

.basil-privacy__section ul {
  padding-left: var(--basil-space-5);
  margin: 0 0 var(--basil-space-3) 0;
}

.basil-privacy__section li {
  font-size: 0.9375rem;
  color: var(--basil-text-secondary);
  line-height: 1.7;
  margin-bottom: var(--basil-space-1);
}

.basil-privacy__section a {
  color: var(--basil-brand);
  text-decoration: none;
}

.basil-privacy__section a:hover {
  text-decoration: underline;
}
</style>
