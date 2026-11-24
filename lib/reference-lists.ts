/**
 * The lists behind the "common" dropdowns: countries, states and provinces,
 * languages and telephone country codes. They are offered as choices, never
 * enforced: a field keeps whatever is already on file, including wording
 * imported from the old CRM that is not in these lists.
 */

export const COUNTRIES: readonly string[] = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Congo (Democratic Republic)", "Costa Rica", "Côte d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czechia",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hong Kong", "Hungary",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Macau", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway",
  "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar",
  "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "São Tomé and Príncipe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Türkiye", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
  "Yemen",
  "Zambia", "Zimbabwe",
];

/** States, provinces and territories for the countries this agency works with. */
export const STATES_BY_COUNTRY: Readonly<Record<string, readonly string[]>> = {
  Australia: ["Australian Capital Territory", "New South Wales", "Northern Territory", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"],
  Bangladesh: ["Barishal", "Chattogram", "Dhaka", "Khulna", "Mymensingh", "Rajshahi", "Rangpur", "Sylhet"],
  Bhutan: ["Bumthang", "Chhukha", "Dagana", "Gasa", "Haa", "Lhuentse", "Mongar", "Paro", "Pemagatshel", "Punakha", "Samdrup Jongkhar", "Samtse", "Sarpang", "Thimphu", "Trashigang", "Trashiyangtse", "Trongsa", "Tsirang", "Wangdue Phodrang", "Zhemgang"],
  Canada: ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"],
  India: ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"],
  Malaysia: ["Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka", "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya", "Sabah", "Sarawak", "Selangor", "Terengganu"],
  Nepal: ["Bagmati", "Gandaki", "Karnali", "Koshi", "Lumbini", "Madhesh", "Sudurpashchim"],
  "New Zealand": ["Auckland", "Bay of Plenty", "Canterbury", "Gisborne", "Hawke's Bay", "Manawatū-Whanganui", "Marlborough", "Nelson", "Northland", "Otago", "Southland", "Taranaki", "Tasman", "Waikato", "Wellington", "West Coast"],
  Pakistan: ["Azad Jammu and Kashmir", "Balochistan", "Gilgit-Baltistan", "Islamabad Capital Territory", "Khyber Pakhtunkhwa", "Punjab", "Sindh"],
  "Sri Lanka": ["Central", "Eastern", "North Central", "North Western", "Northern", "Sabaragamuwa", "Southern", "Uva", "Western"],
  "United Arab Emirates": ["Abu Dhabi", "Ajman", "Dubai", "Fujairah", "Ras Al Khaimah", "Sharjah", "Umm Al Quwain"],
  "United Kingdom": ["England", "Northern Ireland", "Scotland", "Wales"],
  "United States": ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"],
};

const countryKey = (value: string) => value.trim().toLowerCase();
const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  au: "Australia", aus: "Australia", bd: "Bangladesh", bt: "Bhutan", ca: "Canada", in: "India", my: "Malaysia", np: "Nepal",
  nz: "New Zealand", pk: "Pakistan", lk: "Sri Lanka", "sri lankan": "Sri Lanka", ae: "United Arab Emirates", uae: "United Arab Emirates",
  gb: "United Kingdom", uk: "United Kingdom", us: "United States", usa: "United States", "united states of america": "United States",
};

/**
 * The states to offer for a country. With no country chosen, or one whose
 * states are not listed, every listed state is offered with its country as a
 * hint, so the field is still a dropdown rather than a blank box.
 */
export function stateOptions(country: string): { value: string; hint?: string }[] {
  const key = countryKey(country);
  const name = Object.keys(STATES_BY_COUNTRY).find((item) => countryKey(item) === key) ?? COUNTRY_ALIASES[key];
  if (name && STATES_BY_COUNTRY[name]) return STATES_BY_COUNTRY[name].map((value) => ({ value }));
  if (key) return [];
  return Object.entries(STATES_BY_COUNTRY).flatMap(([hint, states]) => states.map((value) => ({ value, hint })));
}

export const LANGUAGES: readonly string[] = [
  "English", "Arabic", "Bengali", "Burmese", "Cantonese", "Dari", "Dzongkha", "Farsi (Persian)", "Filipino (Tagalog)", "French", "German", "Greek", "Gujarati", "Hindi", "Indonesian", "Italian", "Japanese", "Kannada", "Khmer", "Korean", "Malay", "Malayalam", "Mandarin", "Marathi", "Nepali", "Pashto", "Portuguese", "Punjabi", "Russian", "Sinhala", "Somali", "Spanish", "Swahili", "Tamil", "Telugu", "Thai", "Turkish", "Urdu", "Vietnamese",
];

/** Telephone country codes, the agency's own markets first. */
export const CALLING_CODES: readonly { value: string; hint: string }[] = [
  { value: "+61", hint: "Australia" }, { value: "+94", hint: "Sri Lanka" }, { value: "+880", hint: "Bangladesh" }, { value: "+91", hint: "India" },
  { value: "+977", hint: "Nepal" }, { value: "+92", hint: "Pakistan" }, { value: "+975", hint: "Bhutan" }, { value: "+64", hint: "New Zealand" },
  { value: "+1", hint: "Canada / United States" }, { value: "+44", hint: "United Kingdom" }, { value: "+971", hint: "United Arab Emirates" },
  { value: "+93", hint: "Afghanistan" }, { value: "+973", hint: "Bahrain" }, { value: "+55", hint: "Brazil" }, { value: "+855", hint: "Cambodia" },
  { value: "+86", hint: "China" }, { value: "+20", hint: "Egypt" }, { value: "+679", hint: "Fiji" }, { value: "+358", hint: "Finland" },
  { value: "+33", hint: "France" }, { value: "+995", hint: "Georgia" }, { value: "+49", hint: "Germany" }, { value: "+852", hint: "Hong Kong" },
  { value: "+62", hint: "Indonesia" }, { value: "+98", hint: "Iran" }, { value: "+353", hint: "Ireland" }, { value: "+39", hint: "Italy" },
  { value: "+81", hint: "Japan" }, { value: "+254", hint: "Kenya" }, { value: "+965", hint: "Kuwait" }, { value: "+60", hint: "Malaysia" },
  { value: "+960", hint: "Maldives" }, { value: "+356", hint: "Malta" }, { value: "+95", hint: "Myanmar" }, { value: "+31", hint: "Netherlands" },
  { value: "+234", hint: "Nigeria" }, { value: "+968", hint: "Oman" }, { value: "+63", hint: "Philippines" }, { value: "+48", hint: "Poland" },
  { value: "+974", hint: "Qatar" }, { value: "+966", hint: "Saudi Arabia" }, { value: "+65", hint: "Singapore" }, { value: "+27", hint: "South Africa" },
  { value: "+82", hint: "South Korea" }, { value: "+34", hint: "Spain" }, { value: "+46", hint: "Sweden" }, { value: "+66", hint: "Thailand" },
  { value: "+90", hint: "Türkiye" }, { value: "+84", hint: "Vietnam" },
];
