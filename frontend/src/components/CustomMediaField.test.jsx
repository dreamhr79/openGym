// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { exerciseDbFilter, imageSearchScore } from './CustomMediaField.jsx'

const params = query => exerciseDbFilter(query).searchParams
const ex = (name, equipments = [], targetMuscles = ['delts'], bodyParts = ['shoulders']) => ({ name, equipments, targetMuscles, secondaryMuscles: [], bodyParts })

describe('ExerciseDB documented filter builder', () => {
  it('searches ordinary text through the fuzzy name filter', () => {
    const p = params('shoulder press')
    expect(p.get('name')).toBe('shoulder press')
    expect(p.get('equipments')).toBeNull()
    expect(p.get('limit')).toBe('25')
  })

  it('searches smith as equipment so every Smith movement can be returned', () => {
    const p = params('smith')
    expect(p.get('equipments')).toBe('smith machine')
    expect(p.get('name')).toBeNull()
  })

  it('combines movement and Smith equipment filters', () => {
    const p = params('shoulder smith')
    expect(p.get('name')).toBe('shoulder')
    expect(p.get('equipments')).toBe('smith machine')
  })

  it('also accepts the phrase smith machine without leaking it into name', () => {
    const p = params('smith machine bench press')
    expect(p.get('name')).toBe('bench press')
    expect(p.get('equipments')).toBe('smith machine')
  })
})

describe('ExerciseDB result ranking helper', () => {
  it('prefers an exact exercise name', () => {
    expect(imageSearchScore(ex('military press', ['barbell']), 'military press'))
      .toBeGreaterThan(imageSearchScore(ex('seated military press', ['barbell']), 'military press'))
  })

  it('can rank equipment metadata returned by the API', () => {
    expect(imageSearchScore(ex('calf raise', ['smith machine'], ['calves'], ['lower legs']), 'smith')).toBeGreaterThan(0)
  })
})
