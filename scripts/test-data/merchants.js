/**
 * Merchant pools for test data generation.
 * Each merchant has a name, typical amount range, and category mapping.
 * Amounts are positive (sign is applied by the transaction generator).
 */

const MERCHANTS = {
  'Food & Dining': [
    { merchant_name: 'Starbucks', name: 'STARBUCKS STORE #1234', min: 4, max: 12, recurring: false },
    { merchant_name: 'Chipotle', name: 'CHIPOTLE ONLINE ORDER', min: 10, max: 18, recurring: false },
    { merchant_name: 'Whole Foods', name: 'WHOLE FOODS MKT #10234', min: 40, max: 150, recurring: false },
    { merchant_name: 'DoorDash', name: 'DOORDASH*ORDER', min: 15, max: 55, recurring: false },
    { merchant_name: 'Trader Joe\'s', name: 'TRADER JOE\'S #567', min: 25, max: 90, recurring: false },
    { merchant_name: 'Sweetgreen', name: 'SWEETGREEN NYC', min: 12, max: 20, recurring: false },
    { merchant_name: 'Groundwork Coffee', name: 'TST*GROUNDWORK COFFEE - VENICE BLVD', min: 10, max: 35, recurring: false },
    { merchant_name: null, name: 'SQ *CORNER CAFE BROOKLYN HEIGHTS', min: 5, max: 15, recurring: false },
  ],
  'Rent & Utilities': [
    { merchant_name: 'Apartments.com', name: 'APARTMENTS.COM RENT', min: 1800, max: 1800, recurring: true },
    { merchant_name: 'Con Edison', name: 'CON EDISON ELEC/GAS', min: 80, max: 160, recurring: true },
    { merchant_name: 'Spectrum', name: 'SPECTRUM INTERNET', min: 79.99, max: 79.99, recurring: true },
    { merchant_name: 'National Grid', name: 'NATIONAL GRID GAS', min: 40, max: 120, recurring: true },
  ],
  'Transportation': [
    { merchant_name: 'Uber', name: 'UBER *ONE MEMBERSHIP', min: 8, max: 45, recurring: false },
    { merchant_name: 'Lyft', name: 'LYFT *RIDE', min: 10, max: 40, recurring: false },
    { merchant_name: 'MTA', name: 'MTA*NYCT PAYGO', min: 2.90, max: 2.90, recurring: false },
    { merchant_name: 'Shell', name: 'SHELL OIL #12345', min: 35, max: 70, recurring: false },
    { merchant_name: 'Citibike', name: 'CITI BIKE ANNUAL', min: 17.99, max: 17.99, recurring: true },
  ],
  'Entertainment': [
    { merchant_name: 'Netflix', name: 'NETFLIX.COM', min: 15.49, max: 15.49, recurring: true },
    { merchant_name: 'Spotify', name: 'SPOTIFY USA', min: 10.99, max: 10.99, recurring: true },
    { merchant_name: 'AMC Theatres', name: 'AMC THEATRES #1234', min: 14, max: 35, recurring: false },
    { merchant_name: 'Steam', name: 'STEAMGAMES.COM', min: 10, max: 60, recurring: false },
  ],
  'Shopping': [
    { merchant_name: 'Amazon', name: 'AMAZON.COM*1A2B3C', min: 10, max: 200, recurring: false },
    { merchant_name: 'Target', name: 'TARGET #1234', min: 15, max: 120, recurring: false },
    { merchant_name: 'Nike', name: 'NIKE.COM', min: 50, max: 180, recurring: false },
    { merchant_name: 'Apple', name: 'APPLE.COM/BILL', min: 0.99, max: 1499, recurring: false },
    { merchant_name: 'IKEA', name: 'IKEA BROOKLYN', min: 20, max: 300, recurring: false },
  ],
  'Health': [
    { merchant_name: 'CVS', name: 'CVS/PHARMACY #4567', min: 8, max: 60, recurring: false },
    { merchant_name: 'Planet Fitness', name: 'PLANET FITNESS', min: 24.99, max: 24.99, recurring: true },
    { merchant_name: null, name: 'CITYMD URGENT CARE', min: 30, max: 150, recurring: false },
  ],
  'Services': [
    { merchant_name: 'Verizon', name: 'VERIZON WIRELESS', min: 85, max: 85, recurring: true },
    { merchant_name: 'Google', name: 'GOOGLE *SERVICES', min: 2.99, max: 9.99, recurring: true },
    { merchant_name: null, name: 'USPS PO STAMPS', min: 5, max: 15, recurring: false },
  ],
  'Travel': [
    { merchant_name: 'United Airlines', name: 'UNITED AIRLINES INFLIGHT PURCHASE', min: 150, max: 600, recurring: false },
    { merchant_name: 'Airbnb', name: 'AIRBNB *HM1234ABC LONG BEACH CA', min: 100, max: 400, recurring: false },
    { merchant_name: 'Pacific Park Ticketing', name: 'PACIFIC PARK TICKETING SANTA MONICA', min: 25, max: 60, recurring: false },
    { merchant_name: 'Hilton', name: 'HILTON GARDEN INN DOWNTOWN', min: 150, max: 350, recurring: false },
  ],
  'Taxes & Giving': [
    { merchant_name: null, name: 'IRS USATAXPYMT', min: 500, max: 2000, recurring: false },
    { merchant_name: null, name: 'CHARITABLE DONATION', min: 25, max: 200, recurring: false },
  ],
  Income: [
    { merchant_name: null, name: 'GUSTO-OSV PAYROLL1 CITIZENS PAID EARLY', min: 3500, max: 5000, recurring: true, isIncome: true },
    { merchant_name: null, name: 'DIRECT DEPOSIT EMPLOYER PAYROLL ACH', min: 3500, max: 3500, recurring: true, isIncome: true },
    { merchant_name: 'Venmo', name: 'VENMO CASHOUT', min: 20, max: 200, recurring: false, isIncome: true },
  ],
  Payment: [
    { merchant_name: null, name: 'CHASE CREDIT CRD AUTOPAY CHECKING', min: 500, max: 3000, recurring: true, isPayment: true },
    { merchant_name: null, name: 'TRANSFER TO SAVINGS ACCOUNT XXXXXX1234', min: 200, max: 500, recurring: true, isPayment: true },
  ],
};

// P2P merchants — null merchant_name, generic names, for the P2P-heavy persona
const P2P_MERCHANTS = [
  { merchant_name: null, name: 'VENMO PAYMENT', min: 10, max: 200, recurring: false },
  { merchant_name: null, name: 'VENMO CASHOUT', min: 10, max: 150, recurring: false, isIncome: true },
  { merchant_name: null, name: 'ZELLE PAYMENT FROM', min: 15, max: 300, recurring: false, isIncome: true },
  { merchant_name: null, name: 'ZELLE PAYMENT TO', min: 15, max: 300, recurring: false },
  { merchant_name: null, name: 'CASH APP*', min: 5, max: 100, recurring: false },
  { merchant_name: null, name: 'CASH APP CASH OUT', min: 20, max: 200, recurring: false, isIncome: true },
  { merchant_name: 'Venmo', name: 'VENMO', min: 10, max: 200, recurring: false },
];

// Venmo enrichment data — counterparty names and notes for P2P persona
const VENMO_ENRICHMENTS = [
  { counterparty: 'Jake Miller', note: 'dinner split' },
  { counterparty: 'Sarah Chen', note: 'concert tickets' },
  { counterparty: 'Mike Torres', note: 'utilities' },
  { counterparty: 'Emily Park', note: 'brunch' },
  { counterparty: 'Alex Kim', note: 'grocery run' },
  { counterparty: 'Jordan Lee', note: 'rent' },
  { counterparty: 'Rachel Wong', note: 'uber split' },
  { counterparty: 'Dan O\'Brien', note: 'birthday gift' },
];

module.exports = { MERCHANTS, P2P_MERCHANTS, VENMO_ENRICHMENTS };
