// Original code (design note 10 §3.1). Every orogen climate constant is tagged:
//   a = physically scalable, with a rule in map-planet.ts;
//   b = stylistic or empirical, kept at the Earth value (a physical length in km is kept as a length);
//   c = fitted to the energy-balance forcing by least squares (fit.ts).
// A test in packages/gen-orogen fails on a key without a tag here, or a tag without a key.
export type Tag = 'a' | 'b' | 'c';
export interface ClimateTag {
  tag: Tag;
  /** Rule id (class a and c) or the reason it is kept (class b). */
  rule: string;
  unit: string;
}

const a = (rule: string, unit: string): ClimateTag => ({ tag: 'a', rule, unit });
const b = (rule: string, unit: string): ClimateTag => ({ tag: 'b', rule, unit });
const c = (rule: string, unit: string): ClimateTag => ({ tag: 'c', rule, unit });
const EMP = 'empirical tuning, kept';
const LEN = 'physical length in km, kept';

export const CLIMATE_TAGS: Readonly<Record<string, ClimateTag>> = Object.freeze({
  // Wind: ITCZ tracking
  WIND_ITCZ_LAND_BOOST_MAX: b(EMP, '1'),
  WIND_ITCZ_ANCHOR_FACTOR: b(EMP, '1'),
  WIND_ITCZ_CLAMP_DEG: a('obliquity: subsolar-latitude amplitude', 'deg'),
  // Wind: pressure bands
  WIND_ITCZ_LOW_DEPTH_HPA: a('pressure: p_s ratio', 'hPa'),
  WIND_ITCZ_LOW_WIDTH_DEG: b(EMP, 'deg'),
  WIND_SUBTROP_HIGH_LAT_DEG: a('Held-Hou: Hadley edge', 'deg'),
  WIND_SUBTROP_SEASONAL_SHIFT_DEG: a('obliquity: subsolar-latitude amplitude', 'deg'),
  WIND_SUBTROP_HIGH_STRENGTH_HPA: a('pressure: p_s ratio', 'hPa'),
  WIND_SUBTROP_HIGH_WIDTH_DEG: a('Held-Hou: Hadley edge', 'deg'),
  WIND_SUBTROP_LAND_WEAKENING: b(EMP, '1'),
  WIND_SUBPOLAR_LOW_DEPTH_HPA: a('pressure: p_s ratio', 'hPa'),
  WIND_SUBPOLAR_LOW_LAT_DEG: a('Held-Hou: Ferrel width ratio kept', 'deg'),
  WIND_SUBPOLAR_LOW_WIDTH_DEG: b(EMP, 'deg'),
  WIND_POLAR_HIGH_STRENGTH_HPA: a('pressure: p_s ratio', 'hPa'),
  // Wind: land-sea thermal contrast
  WIND_SUMMER_THERMAL_LOW_HPA: a('pressure: p_s ratio', 'hPa'),
  WIND_WINTER_THERMAL_HIGH_HPA: a('pressure: p_s ratio', 'hPa'),
  WIND_CONT_RANGE_KM: b(LEN, 'km'),
  // Wind: Coriolis / friction (the deflection itself uses the planet's f = 2 Omega sin(lat) in code)
  WIND_GEOSTROPHIC_MAX_ANGLE_DEG: b(EMP, 'deg'),
  WIND_FRICTION_BACK_ANGLE_DEG: b(EMP, 'deg'),
  // Temperature: base curve (fitted to the annual-mean energy-balance profile)
  TEMP_PEAK_C: c('fit: EBM zonal profile', 'C'),
  TEMP_POLEWARD_RANGE_C: c('fit: EBM zonal profile', 'C'),
  TEMP_POLEWARD_EXP: c('fit: EBM zonal profile', '1'),
  TEMP_TROPICAL_PLATEAU_DEG: c('fit: EBM zonal profile', 'deg'),
  // Temperature: lapse rate
  TEMP_MOIST_LAPSE_C_PER_KM: a('gravity: g/cp', 'C/km'),
  TEMP_DRY_LAPSE_EXTRA_C_PER_KM: a('gravity: g/cp', 'C/km'),
  // Temperature: ocean-current warmth
  TEMP_OCEAN_WARMTH_DIFFUSE_KM: b(LEN, 'km'),
  TEMP_SST_CURRENT_SHIFT_C: b(EMP, 'C'),
  TEMP_COASTAL_WARMTH_SHIFT_C: b(EMP, 'C'),
  // Temperature: seasonal swing
  TEMP_SWING_SCALE: a('insolation: seasonal amplitude at mid-latitudes', '1'),
  TEMP_EXTRA_SWING_FACTOR: b(EMP, '1'),
  TEMP_SWING_WINTER_SHARE: b(EMP, '1'),
  TEMP_CONT_WINTER_COOL_C: b(EMP, 'C'),
  TEMP_WINTER_COOL_WEST_RELIEF: b(EMP, '1'),
  TEMP_OCEANIC_WARMING_MAX_C: b(EMP, 'C'),
  // Temperature: cloud moderation
  TEMP_CLOUD_MOD_STRENGTH: b(EMP, '1'),
  TEMP_CLEARSKY_AMP_STRENGTH: b(EMP, '1'),
  // Precipitation: moisture and advection
  PRECIP_OCEAN_MOISTURE_BASE: b(EMP, '1'),
  PRECIP_ADVECT_FLAT_SURVIVAL: b(EMP, '1'),
  PRECIP_ADVECT_REACH_KM: b(LEN, 'km'),
  PRECIP_ELEV_DEPLETION_PER_KM: b(EMP, '1/km'),
  // Precipitation: ITCZ and convergence
  PRECIP_ITCZ_WIDTH_DEG: b(EMP, 'deg'),
  PRECIP_ITCZ_CORE_BOOST: b(EMP, '1'),
  PRECIP_ITCZ_ADDITIVE: b(EMP, '1'),
  PRECIP_CONV_MULT_BOOST: b(EMP, '1'),
  PRECIP_CONV_ADD_FRAC: b(EMP, '1'),
  // Precipitation: ocean-current coastal modulation
  PRECIP_COLD_CURRENT_SUPPRESS: b(EMP, '1'),
  PRECIP_WARM_CURRENT_BOOST: b(EMP, '1'),
  // Precipitation: orographic and rain shadow
  PRECIP_ORO_UPLIFT_ADD: b(EMP, '1'),
  PRECIP_ORO_SHADOW_MAX_SUPPRESS: b(EMP, '1'),
  PRECIP_RS_SHADOW_PROP_KM: b(LEN, 'km'),
  PRECIP_RS_APPLY_STRENGTH_SCALE: b(EMP, '1'),
  PRECIP_RS_APPLY_MAX_SUPPRESS: b(EMP, '1'),
  PRECIP_RS_APPLY_WINDWARD_ADD: b(EMP, '1'),
  // Precipitation: subtropical high, Mediterranean, monsoon
  PRECIP_SUBTROP_CENTER_SUMMER_DEG: a('Held-Hou: Hadley edge', 'deg'),
  PRECIP_SUBTROP_CENTER_WINTER_DEG: a('Held-Hou: Hadley edge', 'deg'),
  PRECIP_SUBTROP_WIDTH_SUMMER_DEG: b(EMP, 'deg'),
  PRECIP_SUBTROP_WIDTH_WINTER_DEG: b(EMP, 'deg'),
  PRECIP_SUBTROP_PEAK_SUMMER: b(EMP, '1'),
  PRECIP_SUBTROP_PEAK_WINTER: b(EMP, '1'),
  PRECIP_MONSOON_RELIEF_MAX: b(EMP, '1'),
  PRECIP_MONSOON_ADD: b(EMP, '1'),
  PRECIP_SUBTROP_EAST_RELIEF: b(EMP, '1'),
  PRECIP_MONSOON_REACH_DEG: b(EMP, 'deg'),
  // Precipitation: polar, continental, cutoffs
  PRECIP_POLAR_BASE_ADD: b(EMP, '1'),
  PRECIP_POLAR_COASTAL_ADD: b(EMP, '1'),
  PRECIP_CONT_DRYNESS: b(EMP, '1'),
  PRECIP_COAST_CUTOFF_START_KM: b(LEN, 'km'),
  PRECIP_COAST_CUTOFF_END_KM: b(LEN, 'km'),
  // Precipitation: blending and interior cap
  PRECIP_MODEL_BLEND: b(EMP, '1'),
  PRECIP_CONT_CAP_FADE_START: b(EMP, '1'),
  PRECIP_CONT_CAP_MAX_REDUCTION: b(EMP, '1'),
  PRECIP_SEASON_CONTRAST: b(EMP, '1'),
  // Heuristic zonal precipitation curve
  HEUR_ZONAL_TRADE_VALUE: b(EMP, '1'),
  HEUR_ZONAL_DESERT_MIN: b(EMP, '1'),
  HEUR_ZONAL_DESERT_END_DEG: a('Held-Hou: Hadley edge', 'deg'),
  HEUR_ZONAL_DRY_POLEWARD_DEG: a('Held-Hou: Hadley edge', 'deg'),
  HEUR_ZONAL_WESTERLY_PEAK: b(EMP, '1'),
  HEUR_ZONAL_WESTERLY_PEAK_DEG: a('Held-Hou: Ferrel width ratio kept', 'deg'),
  HEUR_ZONAL_POLAR_MIN: b(EMP, '1'),
  // Koppen proxies (retired outside parity mode by note 11; kept for the two-season configuration)
  KOPPEN_PRECIP_SCALE_MM: b(EMP, 'mm'),
  KOPPEN_ARIDITY_SCALE: b(EMP, '1'),
  KOPPEN_EAST_COAST_WET: b(EMP, '1'),
  KOPPEN_SHOULDER_FRAC: b(EMP, 'months'),
  KOPPEN_DRIEST_FRAC_BASE: b(EMP, '1'),
  KOPPEN_DRIEST_FRAC_DROP: b(EMP, '1'),
  KOPPEN_S_SUMMER_MAX_MM: b('Koppen threshold, fixed', 'mm'),
  KOPPEN_S_RATIO: b('Koppen threshold, fixed', '1'),
  KOPPEN_W_RATIO: b('Koppen threshold, fixed', '1'),
  KOPPEN_AF_DRY_MIN_MM: b('Koppen threshold, fixed', 'mm'),
  // Heuristic modifiers
  HEUR_ITCZ_SHIFT_DAMPEN: b(EMP, '1'),
  HEUR_SEASON_SUMMER_MOD: b(EMP, '1'),
  HEUR_SEASON_WINTER_MOD: b(EMP, '1'),
  HEUR_MED_SUPPRESS_BASE: b(EMP, '1'),
  HEUR_MED_WESTCOAST_BONUS: b(EMP, '1'),
  HEUR_CONT_DRYNESS: b(EMP, '1'),
  HEUR_ORO_UPLIFT_MAX: b(EMP, '1'),
  HEUR_ORO_SHADOW_MAX: b(EMP, '1'),
});
