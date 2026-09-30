// Workflow templates (backend/workflows/*.json): ComfyUI "API format" graphs with {{placeholders}}
// the app fills in. A value that is exactly "{{name}}" becomes the value itself (so numbers stay
// numbers); a placeholder inside longer text is substituted as text.

export interface WorkflowTemplate {
  name: string
  description: string
  /** Node id of the image output. */
  output: string
  prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>
}

export type TemplateValues = Record<string, string | number | boolean>

const WHOLE = /^\{\{(\w+)\}\}$/
const INNER = /\{\{(\w+)\}\}/g

export function parseTemplate(json: string): WorkflowTemplate {
  const t = JSON.parse(json) as Partial<WorkflowTemplate>
  if (!t || typeof t.prompt !== 'object' || typeof t.output !== 'string' || !(t.output in t.prompt!)) {
    throw new Error('Workflow template is missing its prompt or output node.')
  }
  return t as WorkflowTemplate
}

/** The template's graph with every placeholder filled. Throws if one has no value. */
export function fillTemplate(template: WorkflowTemplate, values: TemplateValues): WorkflowTemplate['prompt'] {
  const missing = new Set<string>()
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const whole = WHOLE.exec(v)
      if (whole) {
        if (!(whole[1] in values)) missing.add(whole[1])
        return values[whole[1]]
      }
      return v.replace(INNER, (_, key: string) => {
        if (!(key in values)) missing.add(key)
        return String(values[key] ?? '')
      })
    }
    if (Array.isArray(v)) return v.map(fill)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]))
    return v
  }
  const prompt = fill(structuredClone(template.prompt)) as WorkflowTemplate['prompt']
  if (missing.size) throw new Error(`Workflow "${template.name}" needs: ${[...missing].join(', ')}`)
  return prompt
}
