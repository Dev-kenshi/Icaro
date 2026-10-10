import type { GeoTarget } from './geo-fly';

// Feira de Santana's city-center coordinates supplied in the Ícaro Earth brief.
export const FEIRA_TARGET: GeoTarget = {
  latitude: -12.2664,
  longitude: -38.9663,
  label: 'Feira de Santana, Bahia, Brasil',
  city: 'Feira de Santana',
  state: 'Bahia',
  country: 'Brasil',
};

// Photon/OpenStreetMap resolves the UEFS campus around this mapped university area.
export const UEFS_TARGET: GeoTarget = {
  latitude: -12.2012663,
  longitude: -38.9712037,
  label: 'UEFS, Feira de Santana, Bahia, Brasil',
  city: 'Feira de Santana',
  state: 'Bahia',
  country: 'Brasil',
};

// PREENCHER: latitude e longitude do Abrini. Photon did not identify this POI;
// never substitute the city centroid or another nearby business.
export const ABRINI_TARGET: GeoTarget | null = null;
