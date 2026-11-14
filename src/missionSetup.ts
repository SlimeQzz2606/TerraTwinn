import catalog from './data/missionCities.json'

export const missionCities = catalog.cities
export type MissionCity = typeof missionCities[number]
export type MissionType = 'rover' | 'crewed_lander' | 'isru' | 'surface_base'
export interface MissionSetup { body: 'moon' | 'mars'; mission: MissionType; cityId: string }
export const missionTypes = [
  { id: 'rover', label: 'Rover', detail: 'Test mobility and explore terrain' },
  { id: 'crewed_lander', label: 'Crewed lander', detail: 'Study terrain for crewed landing-module tests' },
  { id: 'isru', label: 'Resource exploration & ISRU', detail: 'Study local soil, rock and resource use' },
  { id: 'surface_base', label: 'Surface base & subsurface exploration', detail: 'Plan a Moon or Mars base, with sourced cave and lava-tube training recommendations' },
] as const

const KEY = 'terratwinn.missionSetup.v1'
export function cityForSetup(setup: MissionSetup) {
  return missionCities.find(city => city.id === setup.cityId)!
}
export function readMissionSetup(): MissionSetup | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    if (value && ['moon', 'mars'].includes(value.body)
      && missionTypes.some(m => m.id === value.mission) && missionCities.some(c => c.id === value.cityId)) {
      return { body: value.body, mission: value.mission, cityId: value.cityId }
    }
  } catch { /* A fresh setup is still usable when storage is unavailable. */ }
  return null
}
export function saveMissionSetup(setup: MissionSetup) {
  try { sessionStorage.setItem(KEY, JSON.stringify(setup)) } catch { /* Current-session state stays in App. */ }
}
export function searchCities(query: string) {
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  return missionCities.filter(city => {
    const text = normalize([city.name, city.country, city.country_code, city.association, ...city.aliases].join(' '))
    return terms.every(term => text.includes(term))
  })
}
