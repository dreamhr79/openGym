// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { imageSearchScore } from './CustomMediaField.jsx'

const ex = (name, equipments = [], targetMuscles = ['delts']) => ({ name, equipments, targetMuscles, secondaryMuscles: [], bodyParts: ['shoulders'] })

describe('ExerciseDB image search ranking', () => {
  it('finds military press through shoulder/overhead naming', () => {
    expect(imageSearchScore(ex('barbell overhead press', ['barbell']), 'military press')).toBeGreaterThan(0)
  })

  it('finds shoulder press directly', () => {
    expect(imageSearchScore(ex('dumbbell shoulder press', ['dumbbell']), 'shoulder press')).toBeGreaterThan(0)
  })

  it('accepts machine synonyms without losing the press match', () => {
    expect(imageSearchScore(ex('lever shoulder press', ['lever machine']), 'shoulder press machine')).toBeGreaterThan(0)
  })

  it('does not return unrelated shoulder movements for a press query', () => {
    expect(imageSearchScore(ex('dumbbell lateral raise', ['dumbbell']), 'shoulder press')).toBe(0)
  })
})
