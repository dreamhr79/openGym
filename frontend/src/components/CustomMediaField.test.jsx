// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { imageSearchScore } from './CustomMediaField.jsx'

const ex = (name, equipments = [], targetMuscles = ['delts'], bodyParts = ['shoulders']) => ({ name, equipments, targetMuscles, secondaryMuscles: [], bodyParts })

describe('ExerciseDB image catalogue filtering', () => {
  it('returns every Smith exercise for a smith query regardless of movement', () => {
    expect(imageSearchScore(ex('Smith shoulder press', ['smith machine']), 'smith')).toBeGreaterThan(0)
    expect(imageSearchScore(ex('Smith calf raise', ['smith machine'], ['calves'], ['lower legs']), 'smith')).toBeGreaterThan(0)
  })

  it('returns shoulder exercises for a shoulder query', () => {
    expect(imageSearchScore(ex('dumbbell lateral raise', ['dumbbell']), 'shoulder')).toBeGreaterThan(0)
    expect(imageSearchScore(ex('Smith shoulder press', ['smith machine']), 'shoulder')).toBeGreaterThan(0)
  })

  it('uses AND semantics for shoulder smith', () => {
    expect(imageSearchScore(ex('Smith shoulder press', ['smith machine']), 'shoulder smith')).toBeGreaterThan(0)
    expect(imageSearchScore(ex('Smith calf raise', ['smith machine'], ['calves'], ['lower legs']), 'shoulder smith')).toBe(0)
    expect(imageSearchScore(ex('dumbbell shoulder press', ['dumbbell']), 'shoulder smith')).toBe(0)
  })

  it('requires every word in longer queries', () => {
    expect(imageSearchScore(ex('Smith shoulder press', ['smith machine']), 'shoulder press smith')).toBeGreaterThan(0)
    expect(imageSearchScore(ex('Smith shoulder shrug', ['smith machine']), 'shoulder press smith')).toBe(0)
  })

  it('does not silently replace military with shoulder or overhead', () => {
    expect(imageSearchScore(ex('barbell overhead press', ['barbell']), 'military press')).toBe(0)
    expect(imageSearchScore(ex('barbell military press', ['barbell']), 'military press')).toBeGreaterThan(0)
  })
})
