const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

function createClient(env) {
  const prefix = env === 'production' ? 'PLAID_PRODUCTION' : 'PLAID_SANDBOX';
  const clientId = process.env[`${prefix}_CLIENT_ID`] || process.env.PLAID_CLIENT_ID;
  const secret = process.env[`${prefix}_SECRET`] || process.env.PLAID_SECRET;

  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
        'Plaid-Version': '2020-09-14',
      },
    },
  }));
}

const sandbox = createClient('sandbox');
const production = createClient('production');

// In production, everyone uses production Plaid (real banks).
// In dev, admin users use production, everyone else uses sandbox.
function forUser(isAdmin) {
  if (process.env.NODE_ENV === 'production') return production;
  return isAdmin ? production : sandbox;
}

// Pick client based on the plaidEnv stored on the account doc.
// Falls back to sandbox if not set.
function forEnv(plaidEnv) {
  return plaidEnv === 'production' ? production : sandbox;
}

module.exports = { sandbox, production, forUser, forEnv };
