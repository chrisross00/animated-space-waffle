/**
 * Curated mapping of Plaid PFC detail codes to Basil default categories.
 *
 * This is the single source of truth for how Plaid transactions are auto-categorized
 * when no user-defined rules (compound or simple) match. The categorization engine
 * checks detail codes before falling back to To Sort.
 *
 * Maintenance: when Plaid adds new detail codes, add them here. Unmapped codes
 * fall through to "To Sort" automatically.
 */

const PFC_DETAIL_TO_CATEGORY = {
  // ── Income ──────────────────────────────────────────────
  INCOME_CHILD_SUPPORT: 'Income',
  INCOME_CONTRACTOR: 'Income',
  INCOME_DIVIDENDS: 'Income',
  INCOME_GIG_ECONOMY: 'Income',
  INCOME_INTEREST_EARNED: 'Income',
  INCOME_LONG_TERM_DISABILITY: 'Income',
  INCOME_MILITARY: 'Income',
  INCOME_RENTAL: 'Income',
  INCOME_RETIREMENT_PENSION: 'Income',
  INCOME_SALARY: 'Income',
  INCOME_TAX_REFUND: 'Income',
  INCOME_UNEMPLOYMENT: 'Income',
  INCOME_OTHER: 'Income',

  // ── Payments & Transfers ────────────────────────────────
  // Loan disbursements (debt inflows — not income)
  LOAN_DISBURSEMENTS_AUTO: 'Payments & Transfers',
  LOAN_DISBURSEMENTS_CASH_ADVANCES: 'Payments & Transfers',
  LOAN_DISBURSEMENTS_EWA: 'Payments & Transfers',
  LOAN_DISBURSEMENTS_MORTGAGE: 'Payments & Transfers',
  LOAN_DISBURSEMENTS_PERSONAL: 'Payments & Transfers',
  LOAN_DISBURSEMENTS_STUDENT: 'Payments & Transfers',
  LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT: 'Payments & Transfers',

  // Loan payments
  LOAN_PAYMENTS_BNPL: 'Payments & Transfers',
  LOAN_PAYMENTS_CAR_PAYMENT: 'Payments & Transfers',
  LOAN_PAYMENTS_CASH_ADVANCES: 'Payments & Transfers',
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: 'Payments & Transfers',
  LOAN_PAYMENTS_EWA: 'Payments & Transfers',
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: 'Payments & Transfers',
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: 'Payments & Transfers',
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: 'Payments & Transfers',
  LOAN_PAYMENTS_OTHER_PAYMENT: 'Payments & Transfers',

  // Transfers in (money moving between own accounts)
  TRANSFER_IN_ACCOUNT_TRANSFER: 'Payments & Transfers',
  TRANSFER_IN_DEPOSIT: 'Payments & Transfers',
  TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: 'Payments & Transfers',
  TRANSFER_IN_SAVINGS: 'Payments & Transfers',
  TRANSFER_IN_WIRE: 'Payments & Transfers',
  TRANSFER_IN_CASH_ADVANCES_AND_LOANS: 'Payments & Transfers',
  TRANSFER_IN_OTHER_TRANSFER_IN: 'Payments & Transfers',

  // Transfers out (money moving between own accounts)
  TRANSFER_OUT_ACCOUNT_TRANSFER: 'Payments & Transfers',
  TRANSFER_OUT_CRYPTO: 'Payments & Transfers',
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: 'Payments & Transfers',
  TRANSFER_OUT_SAVINGS: 'Payments & Transfers',
  TRANSFER_OUT_WIRE: 'Payments & Transfers',
  TRANSFER_OUT_WITHDRAWAL: 'Payments & Transfers',
  TRANSFER_OUT_OTHER_TRANSFER_OUT: 'Payments & Transfers',

  // P2P app transfers — could be anything, user must sort
  TRANSFER_IN_TRANSFER_IN_FROM_APPS: 'To Sort',
  TRANSFER_OUT_TRANSFER_OUT_FROM_APPS: 'To Sort',

  // ── Services (bank fees are real expenses) ──────────────
  BANK_FEES_ATM_FEES: 'Services',
  BANK_FEES_INSUFFICIENT_FUNDS: 'Services',
  BANK_FEES_INTEREST_CHARGE: 'Services',
  BANK_FEES_FOREIGN_TRANSACTION_FEES: 'Services',
  BANK_FEES_OVERDRAFT_FEES: 'Services',
  BANK_FEES_LATE_FEES: 'Services',
  BANK_FEES_CASH_ADVANCE: 'Services',
  BANK_FEES_OTHER_BANK_FEES: 'Services',

  // ── Entertainment ───────────────────────────────────────
  ENTERTAINMENT_CASINOS_AND_GAMBLING: 'Entertainment',
  ENTERTAINMENT_MUSIC_AND_AUDIO: 'Entertainment',
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: 'Entertainment',
  ENTERTAINMENT_TV_AND_MOVIES: 'Entertainment',
  ENTERTAINMENT_VIDEO_GAMES: 'Entertainment',
  ENTERTAINMENT_OTHER_ENTERTAINMENT: 'Entertainment',

  // ── Food & Dining ──────────────────────────────────────
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: 'Food & Dining',
  FOOD_AND_DRINK_COFFEE: 'Food & Dining',
  FOOD_AND_DRINK_FAST_FOOD: 'Food & Dining',
  FOOD_AND_DRINK_GROCERIES: 'Food & Dining',
  FOOD_AND_DRINK_RESTAURANT: 'Food & Dining',
  FOOD_AND_DRINK_VENDING_MACHINES: 'Food & Dining',
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: 'Food & Dining',

  // ── Shopping ───────────────────────────────────────────
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: 'Shopping',
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: 'Shopping',
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: 'Shopping',
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: 'Shopping',
  GENERAL_MERCHANDISE_DISCOUNT_STORES: 'Shopping',
  GENERAL_MERCHANDISE_ELECTRONICS: 'Shopping',
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: 'Shopping',
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: 'Shopping',
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: 'Shopping',
  GENERAL_MERCHANDISE_PET_SUPPLIES: 'Shopping',
  GENERAL_MERCHANDISE_SPORTING_GOODS: 'Shopping',
  GENERAL_MERCHANDISE_SUPERSTORES: 'Shopping',
  GENERAL_MERCHANDISE_TOBACCO_AND_VAPE: 'Shopping',
  GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE: 'Shopping',

  // ── Rent & Utilities ───────────────────────────────────
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: 'Rent & Utilities',
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: 'Rent & Utilities',
  RENT_AND_UTILITIES_RENT: 'Rent & Utilities',
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: 'Rent & Utilities',
  RENT_AND_UTILITIES_TELEPHONE: 'Rent & Utilities',
  RENT_AND_UTILITIES_WATER: 'Rent & Utilities',
  RENT_AND_UTILITIES_OTHER_UTILITIES: 'Rent & Utilities',

  // Home improvement → Rent & Utilities
  HOME_IMPROVEMENT_FURNITURE: 'Rent & Utilities',
  HOME_IMPROVEMENT_HARDWARE: 'Rent & Utilities',
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: 'Rent & Utilities',
  HOME_IMPROVEMENT_SECURITY: 'Rent & Utilities',
  HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT: 'Rent & Utilities',

  // ── Health ─────────────────────────────────────────────
  MEDICAL_DENTAL_CARE: 'Health',
  MEDICAL_EYE_CARE: 'Health',
  MEDICAL_NURSING_CARE: 'Health',
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: 'Health',
  MEDICAL_PRIMARY_CARE: 'Health',
  MEDICAL_VETERINARY_SERVICES: 'Health',
  MEDICAL_OTHER_MEDICAL: 'Health',

  // Personal care → Health
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'Health',
  PERSONAL_CARE_HAIR_AND_BEAUTY: 'Health',
  PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: 'Health',
  PERSONAL_CARE_OTHER_PERSONAL_CARE: 'Health',

  // ── Services ───────────────────────────────────────────
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: 'Services',
  GENERAL_SERVICES_AUTOMOTIVE: 'Services',
  GENERAL_SERVICES_CHILDCARE: 'Services',
  GENERAL_SERVICES_CONSULTING_AND_LEGAL: 'Services',
  GENERAL_SERVICES_EDUCATION: 'Services',
  GENERAL_SERVICES_INSURANCE: 'Services',
  GENERAL_SERVICES_POSTAGE_AND_SHIPPING: 'Services',
  GENERAL_SERVICES_STORAGE: 'Services',
  GENERAL_SERVICES_OTHER_GENERAL_SERVICES: 'Services',

  // ── Taxes & Giving ─────────────────────────────────────
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: 'Taxes & Giving',
  GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: 'Taxes & Giving',
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: 'Taxes & Giving',
  GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT: 'Taxes & Giving',

  // ── Transportation ─────────────────────────────────────
  TRANSPORTATION_BIKES_AND_SCOOTERS: 'Transportation',
  TRANSPORTATION_GAS: 'Transportation',
  TRANSPORTATION_PARKING: 'Transportation',
  TRANSPORTATION_PUBLIC_TRANSIT: 'Transportation',
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: 'Transportation',
  TRANSPORTATION_TOLLS: 'Transportation',
  TRANSPORTATION_OTHER_TRANSPORTATION: 'Transportation',

  // ── Travel ─────────────────────────────────────────────
  TRAVEL_FLIGHTS: 'Travel',
  TRAVEL_LODGING: 'Travel',
  TRAVEL_RENTAL_CARS: 'Travel',
  TRAVEL_OTHER_TRAVEL: 'Travel',

  // ── Catch-all ──────────────────────────────────────────
  OTHER_OTHER: 'To Sort',
};

module.exports = { PFC_DETAIL_TO_CATEGORY };
