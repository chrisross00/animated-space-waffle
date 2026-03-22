/**
 * Merchant pools for test data generation.
 * Each merchant has a name, typical amount range, and category mapping.
 * Amounts are positive (sign is applied by the transaction generator).
 */

const MERCHANTS = {
  'Food & Dining': [
    { merchant_name: 'Starbucks', name: 'STARBUCKS STORE #1234', min: 4, max: 12, recurring: false, pfc: 'FOOD_AND_DRINK', pfcDetailed: 'FOOD_AND_DRINK_COFFEE' },
    { merchant_name: 'Chipotle', name: 'CHIPOTLE ONLINE ORDER', min: 10, max: 18, recurring: false, pfc: 'FOOD_AND_DRINK', pfcDetailed: 'FOOD_AND_DRINK_RESTAURANT' },
    { merchant_name: 'Whole Foods', name: 'WHOLE FOODS MKT #10234', min: 40, max: 150, recurring: false, pfc: 'FOOD_AND_DRINK', pfcDetailed: 'FOOD_AND_DRINK_GROCERIES' },
    { merchant_name: 'DoorDash', name: 'DOORDASH*ORDER', min: 15, max: 55, recurring: false, pfc: 'FOOD_AND_DRINK', pfcDetailed: 'FOOD_AND_DRINK_RESTAURANT' },
    { merchant_name: 'Trader Joe\'s', name: 'TRADER JOE\'S #567', min: 25, max: 90, recurring: false, pfc: 'FOOD_AND_DRINK', pfcDetailed: 'FOOD_AND_DRINK_GROCERIES' },
    { merchant_name: 'Sweetgreen', name: 'SWEETGREEN NYC', min: 12, max: 20, recurring: false, pfc: 'FOOD_AND_DRINK', pfcDetailed: 'FOOD_AND_DRINK_RESTAURANT' },
    { merchant_name: 'Groundwork Coffee', name: 'TST*GROUNDWORK COFFEE - VENICE BLVD', min: 10, max: 35, recurring: false, pfc: 'FOOD_AND_DRINK', pfcDetailed: 'FOOD_AND_DRINK_COFFEE' },
    { merchant_name: null, name: 'SQ *CORNER CAFE BROOKLYN HEIGHTS', min: 5, max: 15, recurring: false, pfc: 'FOOD_AND_DRINK', pfcDetailed: 'FOOD_AND_DRINK_COFFEE' },
  ],
  'Rent & Utilities': [
    { merchant_name: 'Apartments.com', name: 'APARTMENTS.COM RENT', min: 1800, max: 1800, recurring: true, pfc: 'RENT_AND_UTILITIES', pfcDetailed: 'RENT_AND_UTILITIES_RENT' },
    { merchant_name: 'Con Edison', name: 'CON EDISON ELEC/GAS', min: 80, max: 160, recurring: true, pfc: 'RENT_AND_UTILITIES', pfcDetailed: 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY' },
    { merchant_name: 'Spectrum', name: 'SPECTRUM INTERNET', min: 79.99, max: 79.99, recurring: true, pfc: 'RENT_AND_UTILITIES', pfcDetailed: 'RENT_AND_UTILITIES_INTERNET_AND_CABLE' },
    { merchant_name: 'National Grid', name: 'NATIONAL GRID GAS', min: 40, max: 120, recurring: true, pfc: 'RENT_AND_UTILITIES', pfcDetailed: 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY' },
  ],
  'Transportation': [
    { merchant_name: 'Uber', name: 'UBER *ONE MEMBERSHIP', min: 8, max: 45, recurring: false, pfc: 'TRANSPORTATION', pfcDetailed: 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES' },
    { merchant_name: 'Lyft', name: 'LYFT *RIDE', min: 10, max: 40, recurring: false, pfc: 'TRANSPORTATION', pfcDetailed: 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES' },
    { merchant_name: 'MTA', name: 'MTA*NYCT PAYGO', min: 2.90, max: 2.90, recurring: false, pfc: 'TRANSPORTATION', pfcDetailed: 'TRANSPORTATION_PUBLIC_TRANSIT' },
    { merchant_name: 'Shell', name: 'SHELL OIL #12345', min: 35, max: 70, recurring: false, pfc: 'TRANSPORTATION', pfcDetailed: 'TRANSPORTATION_GAS' },
    { merchant_name: 'Citibike', name: 'CITI BIKE ANNUAL', min: 17.99, max: 17.99, recurring: true, pfc: 'TRANSPORTATION', pfcDetailed: 'TRANSPORTATION_PUBLIC_TRANSIT' },
  ],
  'Entertainment': [
    { merchant_name: 'Netflix', name: 'NETFLIX.COM', min: 15.49, max: 15.49, recurring: true, pfc: 'ENTERTAINMENT', pfcDetailed: 'ENTERTAINMENT_TV_AND_MOVIES' },
    { merchant_name: 'Spotify', name: 'SPOTIFY USA', min: 10.99, max: 10.99, recurring: true, pfc: 'ENTERTAINMENT', pfcDetailed: 'ENTERTAINMENT_MUSIC' },
    { merchant_name: 'AMC Theatres', name: 'AMC THEATRES #1234', min: 14, max: 35, recurring: false, pfc: 'ENTERTAINMENT', pfcDetailed: 'ENTERTAINMENT_TV_AND_MOVIES' },
    { merchant_name: 'Steam', name: 'STEAMGAMES.COM', min: 10, max: 60, recurring: false, pfc: 'ENTERTAINMENT', pfcDetailed: 'ENTERTAINMENT_VIDEO_GAMES' },
  ],
  'Shopping': [
    { merchant_name: 'Amazon', name: 'AMAZON.COM*1A2B3C', min: 10, max: 200, recurring: false, pfc: 'GENERAL_MERCHANDISE', pfcDetailed: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES' },
    { merchant_name: 'Target', name: 'TARGET #1234', min: 15, max: 120, recurring: false, pfc: 'GENERAL_MERCHANDISE', pfcDetailed: 'GENERAL_MERCHANDISE_SUPERSTORES' },
    { merchant_name: 'Nike', name: 'NIKE.COM', min: 50, max: 180, recurring: false, pfc: 'GENERAL_MERCHANDISE', pfcDetailed: 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES' },
    { merchant_name: 'Apple', name: 'APPLE.COM/BILL', min: 0.99, max: 1499, recurring: false, pfc: 'GENERAL_MERCHANDISE', pfcDetailed: 'GENERAL_MERCHANDISE_ELECTRONICS' },
    { merchant_name: 'IKEA', name: 'IKEA BROOKLYN', min: 20, max: 300, recurring: false, pfc: 'HOME_IMPROVEMENT', pfcDetailed: 'HOME_IMPROVEMENT_FURNITURE' },
  ],
  'Health': [
    { merchant_name: 'CVS', name: 'CVS/PHARMACY #4567', min: 8, max: 60, recurring: false, pfc: 'MEDICAL', pfcDetailed: 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS' },
    { merchant_name: 'Planet Fitness', name: 'PLANET FITNESS', min: 24.99, max: 24.99, recurring: true, pfc: 'PERSONAL_CARE', pfcDetailed: 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS' },
    { merchant_name: null, name: 'CITYMD URGENT CARE', min: 30, max: 150, recurring: false, pfc: 'MEDICAL', pfcDetailed: 'MEDICAL_PRIMARY_CARE' },
  ],
  'Services': [
    { merchant_name: 'Verizon', name: 'VERIZON WIRELESS', min: 85, max: 85, recurring: true, pfc: 'RENT_AND_UTILITIES', pfcDetailed: 'RENT_AND_UTILITIES_TELEPHONE' },
    { merchant_name: 'Google', name: 'GOOGLE *SERVICES', min: 2.99, max: 9.99, recurring: true, pfc: 'GENERAL_SERVICES', pfcDetailed: 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES' },
    { merchant_name: null, name: 'USPS PO STAMPS', min: 5, max: 15, recurring: false, pfc: 'GENERAL_SERVICES', pfcDetailed: 'GENERAL_SERVICES_POSTAGE_AND_SHIPPING' },
  ],
  'Travel': [
    { merchant_name: 'United Airlines', name: 'UNITED AIRLINES INFLIGHT PURCHASE', min: 150, max: 600, recurring: false, pfc: 'TRAVEL', pfcDetailed: 'TRAVEL_FLIGHTS' },
    { merchant_name: 'Airbnb', name: 'AIRBNB *HM1234ABC LONG BEACH CA', min: 100, max: 400, recurring: false, pfc: 'TRAVEL', pfcDetailed: 'TRAVEL_LODGING' },
    { merchant_name: 'Pacific Park Ticketing', name: 'PACIFIC PARK TICKETING SANTA MONICA', min: 25, max: 60, recurring: false, pfc: 'ENTERTAINMENT', pfcDetailed: 'ENTERTAINMENT_AMUSEMENT_PARKS_AND_ATTRACTIONS' },
    { merchant_name: 'Hilton', name: 'HILTON GARDEN INN DOWNTOWN', min: 150, max: 350, recurring: false, pfc: 'TRAVEL', pfcDetailed: 'TRAVEL_LODGING' },
  ],
  'Taxes & Giving': [
    { merchant_name: null, name: 'IRS USATAXPYMT', min: 500, max: 2000, recurring: false, pfc: 'GOVERNMENT_AND_NON_PROFIT', pfcDetailed: 'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT' },
    { merchant_name: null, name: 'CHARITABLE DONATION', min: 25, max: 200, recurring: false, pfc: 'GOVERNMENT_AND_NON_PROFIT', pfcDetailed: 'GOVERNMENT_AND_NON_PROFIT_DONATIONS' },
  ],
  Income: [
    { merchant_name: null, name: 'GUSTO-OSV PAYROLL1 CITIZENS PAID EARLY', min: 3500, max: 5000, recurring: true, isIncome: true, pfc: 'INCOME', pfcDetailed: 'INCOME_WAGES' },
    { merchant_name: null, name: 'DIRECT DEPOSIT EMPLOYER PAYROLL ACH', min: 3500, max: 3500, recurring: true, isIncome: true, pfc: 'INCOME', pfcDetailed: 'INCOME_WAGES' },
    { merchant_name: 'Venmo', name: 'VENMO CASHOUT', min: 20, max: 200, recurring: false, isIncome: true, pfc: 'TRANSFER_IN', pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' },
  ],
  'Payments & Transfers': [
    { merchant_name: null, name: 'CHASE CREDIT CRD AUTOPAY CHECKING', min: 500, max: 3000, recurring: true, isPayment: true, pfc: 'LOAN_PAYMENTS', pfcDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' },
    { merchant_name: null, name: 'TRANSFER TO SAVINGS ACCOUNT XXXXXX1234', min: 200, max: 500, recurring: true, isPayment: true, pfc: 'TRANSFER_OUT', pfcDetailed: 'TRANSFER_OUT_SAVINGS' },
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
