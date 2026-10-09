import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseProject } from './project'

// The demo scene that ships with the app (demo/, opened from the start screen) must always load.
describe('demo scene', () => {
  it('opens as a project with figures, lights and shots', () => {
    const project = parseProject(readFileSync(join(__dirname, '../../demo/cafe-terrace.json'), 'utf-8'))
    expect(project.name).toBe('Café Terrace')
    const nodes = Object.values(project.scenes[0].nodes)
    expect(nodes.filter((n) => n.type === 'mannequin')).toHaveLength(3)
    expect(nodes.filter((n) => n.type === 'light').length).toBeGreaterThan(0)
    expect(nodes.filter((n) => n.type === 'camera').map((n) => (n.type === 'camera' ? n.shotNumber : ''))).toEqual(['1A', '1B', '1C'])
  })
})
