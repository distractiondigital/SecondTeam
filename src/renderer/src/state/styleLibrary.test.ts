import { describe, expect, it } from 'vitest'
import { sanitizeStylePresets } from './styleLibrary'

describe('style presets', () => {
  it('keeps valid presets and repairs or drops damaged ones', () => {
    const presets = sanitizeStylePresets([
      { id: 'a', name: 'Gritty crime drama', text: 'photoreal, desaturated teal and amber', checkpoint: 'RealVisXL_V5.0_fp16.safetensors' },
      { id: 'b', name: '  ', text: 'pencil sketchbook drawing' },
      { id: 'c', name: 'No text' },
      null,
      'nonsense'
    ])
    expect(presets).toEqual([
      { id: 'a', name: 'Gritty crime drama', text: 'photoreal, desaturated teal and amber', checkpoint: 'RealVisXL_V5.0_fp16.safetensors' },
      { id: 'b', name: 'Style', text: 'pencil sketchbook drawing', checkpoint: null }
    ])
    expect(sanitizeStylePresets(undefined)).toEqual([])
  })
})
