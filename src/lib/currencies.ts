export interface Currency {
  code: string
  symbol: string
  name: string
}

/** The everyday block shown before the A–Z tail; INR first (the app default). */
export const PINNED_CODES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SGD',
  'AUD',
  'CAD',
  'JPY',
  'CNY',
  'THB',
  'MYR',
  'LKR',
  'CHF',
] as const

// Every active ISO 4217 currency (special-purpose and retired codes pruned),
// generated from ICU data: pinned block first, then A–Z by code. Symbols fall
// back to the code where no conventional sign exists — clearer on statements.
export const CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'AFN', symbol: '؋', name: 'Afghan Afghani' },
  { code: 'ALL', symbol: 'ALL', name: 'Albanian Lek' },
  { code: 'AMD', symbol: '֏', name: 'Armenian Dram' },
  { code: 'AOA', symbol: 'Kz', name: 'Angolan Kwanza' },
  { code: 'ARS', symbol: '$', name: 'Argentine Peso' },
  { code: 'AWG', symbol: 'AWG', name: 'Aruban Florin' },
  { code: 'AZN', symbol: '₼', name: 'Azerbaijani Manat' },
  { code: 'BAM', symbol: 'KM', name: 'Bosnia-Herzegovina Convertible Mark' },
  { code: 'BBD', symbol: '$', name: 'Barbadian Dollar' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'BGN', symbol: 'BGN', name: 'Bulgarian Lev' },
  { code: 'BHD', symbol: 'BHD', name: 'Bahraini Dinar' },
  { code: 'BIF', symbol: 'BIF', name: 'Burundian Franc' },
  { code: 'BMD', symbol: '$', name: 'Bermudan Dollar' },
  { code: 'BND', symbol: '$', name: 'Brunei Dollar' },
  { code: 'BOB', symbol: 'Bs', name: 'Bolivian Boliviano' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'BSD', symbol: '$', name: 'Bahamian Dollar' },
  { code: 'BTN', symbol: 'BTN', name: 'Bhutanese Ngultrum' },
  { code: 'BWP', symbol: 'P', name: 'Botswanan Pula' },
  { code: 'BYN', symbol: 'BYN', name: 'Belarusian Ruble' },
  { code: 'BZD', symbol: '$', name: 'Belize Dollar' },
  { code: 'CDF', symbol: 'CDF', name: 'Congolese Franc' },
  { code: 'CLP', symbol: '$', name: 'Chilean Peso' },
  { code: 'COP', symbol: '$', name: 'Colombian Peso' },
  { code: 'CRC', symbol: '₡', name: 'Costa Rican Colón' },
  { code: 'CUP', symbol: '$', name: 'Cuban Peso' },
  { code: 'CVE', symbol: 'CVE', name: 'Cape Verdean Escudo' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'DJF', symbol: 'DJF', name: 'Djiboutian Franc' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'DOP', symbol: '$', name: 'Dominican Peso' },
  { code: 'DZD', symbol: 'DZD', name: 'Algerian Dinar' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'ERN', symbol: 'ERN', name: 'Eritrean Nakfa' },
  { code: 'ETB', symbol: 'ETB', name: 'Ethiopian Birr' },
  { code: 'FJD', symbol: '$', name: 'Fijian Dollar' },
  { code: 'FKP', symbol: '£', name: 'Falkland Islands Pound' },
  { code: 'GEL', symbol: '₾', name: 'Georgian Lari' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  { code: 'GIP', symbol: '£', name: 'Gibraltar Pound' },
  { code: 'GMD', symbol: 'GMD', name: 'Gambian Dalasi' },
  { code: 'GNF', symbol: 'FG', name: 'Guinean Franc' },
  { code: 'GTQ', symbol: 'Q', name: 'Guatemalan Quetzal' },
  { code: 'GYD', symbol: '$', name: 'Guyanaese Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'HNL', symbol: 'L', name: 'Honduran Lempira' },
  { code: 'HTG', symbol: 'HTG', name: 'Haitian Gourde' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'ILS', symbol: '₪', name: 'Israeli New Shekel' },
  { code: 'IQD', symbol: 'IQD', name: 'Iraqi Dinar' },
  { code: 'IRR', symbol: 'IRR', name: 'Iranian Rial' },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna' },
  { code: 'JMD', symbol: '$', name: 'Jamaican Dollar' },
  { code: 'JOD', symbol: 'JOD', name: 'Jordanian Dinar' },
  { code: 'KES', symbol: 'KES', name: 'Kenyan Shilling' },
  { code: 'KGS', symbol: 'KGS', name: 'Kyrgyz Som' },
  { code: 'KHR', symbol: '៛', name: 'Cambodian Riel' },
  { code: 'KMF', symbol: 'CF', name: 'Comorian Franc' },
  { code: 'KPW', symbol: '₩', name: 'North Korean Won' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'KWD', symbol: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'KYD', symbol: '$', name: 'Cayman Islands Dollar' },
  { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge' },
  { code: 'LAK', symbol: '₭', name: 'Laotian Kip' },
  { code: 'LBP', symbol: 'L£', name: 'Lebanese Pound' },
  { code: 'LRD', symbol: '$', name: 'Liberian Dollar' },
  { code: 'LSL', symbol: 'LSL', name: 'Lesotho Loti' },
  { code: 'LYD', symbol: 'LYD', name: 'Libyan Dinar' },
  { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham' },
  { code: 'MDL', symbol: 'MDL', name: 'Moldovan Leu' },
  { code: 'MGA', symbol: 'Ar', name: 'Malagasy Ariary' },
  { code: 'MKD', symbol: 'MKD', name: 'Macedonian Denar' },
  { code: 'MMK', symbol: 'K', name: 'Myanmar Kyat' },
  { code: 'MNT', symbol: '₮', name: 'Mongolian Tugrik' },
  { code: 'MOP', symbol: 'MOP', name: 'Macanese Pataca' },
  { code: 'MRU', symbol: 'MRU', name: 'Mauritanian Ouguiya' },
  { code: 'MUR', symbol: 'Rs', name: 'Mauritian Rupee' },
  { code: 'MVR', symbol: 'MVR', name: 'Maldivian Rufiyaa' },
  { code: 'MWK', symbol: 'MWK', name: 'Malawian Kwacha' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'MZN', symbol: 'MZN', name: 'Mozambican Metical' },
  { code: 'NAD', symbol: '$', name: 'Namibian Dollar' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'NIO', symbol: 'C$', name: 'Nicaraguan Córdoba' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'NPR', symbol: 'Rs', name: 'Nepalese Rupee' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'OMR', symbol: 'OMR', name: 'Omani Rial' },
  { code: 'PAB', symbol: 'PAB', name: 'Panamanian Balboa' },
  { code: 'PEN', symbol: 'PEN', name: 'Peruvian Sol' },
  { code: 'PGK', symbol: 'PGK', name: 'Papua New Guinean Kina' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'PYG', symbol: '₲', name: 'Paraguayan Guarani' },
  { code: 'QAR', symbol: 'QAR', name: 'Qatari Riyal' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'RSD', symbol: 'RSD', name: 'Serbian Dinar' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'RWF', symbol: 'RF', name: 'Rwandan Franc' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal' },
  { code: 'SBD', symbol: '$', name: 'Solomon Islands Dollar' },
  { code: 'SCR', symbol: 'SCR', name: 'Seychellois Rupee' },
  { code: 'SDG', symbol: 'SDG', name: 'Sudanese Pound' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'SHP', symbol: '£', name: 'St. Helena Pound' },
  { code: 'SLE', symbol: 'SLE', name: 'Sierra Leonean Leone' },
  { code: 'SOS', symbol: 'SOS', name: 'Somali Shilling' },
  { code: 'SRD', symbol: '$', name: 'Surinamese Dollar' },
  { code: 'SSP', symbol: '£', name: 'South Sudanese Pound' },
  { code: 'STN', symbol: 'Db', name: 'São Tomé & Príncipe Dobra' },
  { code: 'SVC', symbol: 'SVC', name: 'Salvadoran Colón' },
  { code: 'SYP', symbol: '£', name: 'Syrian Pound' },
  { code: 'SZL', symbol: 'SZL', name: 'Swazi Lilangeni' },
  { code: 'TJS', symbol: 'TJS', name: 'Tajikistani Somoni' },
  { code: 'TMT', symbol: 'TMT', name: 'Turkmenistani Manat' },
  { code: 'TND', symbol: 'TND', name: 'Tunisian Dinar' },
  { code: 'TOP', symbol: 'T$', name: 'Tongan Paʻanga' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'TTD', symbol: '$', name: 'Trinidad & Tobago Dollar' },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar' },
  { code: 'TZS', symbol: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
  { code: 'UGX', symbol: 'UGX', name: 'Ugandan Shilling' },
  { code: 'UYU', symbol: '$', name: 'Uruguayan Peso' },
  { code: 'UZS', symbol: 'UZS', name: 'Uzbekistani Som' },
  { code: 'VES', symbol: 'VES', name: 'Venezuelan Bolívar' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'VUV', symbol: 'VUV', name: 'Vanuatu Vatu' },
  { code: 'WST', symbol: 'WST', name: 'Samoan Tala' },
  { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc' },
  { code: 'XCD', symbol: 'EC$', name: 'East Caribbean Dollar' },
  { code: 'XCG', symbol: 'Cg.', name: 'Caribbean Guilder' },
  { code: 'XOF', symbol: 'F CFA', name: 'West African CFA Franc' },
  { code: 'XPF', symbol: 'CFPF', name: 'CFP Franc' },
  { code: 'YER', symbol: 'YER', name: 'Yemeni Rial' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha' },
  { code: 'ZWG', symbol: 'ZWG', name: 'Zimbabwean Gold' },
]

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code
}

// Fold case, diacritics and apostrophe-like marks so plain iOS keyboard input
// matches ICU names: "colon" → Colón, "krona" → Króna, "paanga" → Paʻanga.
const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʻʼ’']/g, '')

/** Accent-insensitive match on code, name or symbol; code-prefix hits rank first. */
export function filterCurrencies(query: string): Currency[] {
  const q = fold(query.trim())
  if (q === '') return CURRENCIES
  const prefix: Currency[] = []
  const rest: Currency[] = []
  for (const c of CURRENCIES) {
    const code = c.code.toLowerCase()
    if (code.startsWith(q)) prefix.push(c)
    else if (code.includes(q) || fold(c.name).includes(q) || fold(c.symbol).includes(q)) {
      rest.push(c)
    }
  }
  return [...prefix, ...rest]
}
