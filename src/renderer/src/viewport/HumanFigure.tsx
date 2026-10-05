import { useMemo } from 'react'
import { fitHuman } from '../../../shared/humanBody'
import type { MannequinNode } from '../../../shared/project'
import { useDocument } from '../state/documentStore'
import HumanView from './HumanView'
import { useBodyData } from './humanData'
import MannequinView from './MannequinView'

// A figure in the Human style: the visible MakeHuman body, plus the mannequin's joint skeleton
// fitted to that body and drawn invisible. The skeleton is what you click and pose (and what the
// pose pass reads); the body follows it.

interface Props {
  node: MannequinNode
  selected: boolean
  clickable: boolean
  passive?: boolean
  clay?: boolean
}

export default function HumanFigure({ node, selected, clickable, passive = false, clay = false }: Props) {
  const data = useBodyData()
  const { gender, age, muscle, weight } = node.body
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fit = useMemo(() => (data ? fitHuman(data, node.body, node.height) : null), [data, gender, age, muscle, weight, node.height])
  // A figure linked to a cast member wears that cast member's colour.
  const castColor = useDocument((s) => (node.castId ? s.project.cast.find((c) => c.id === node.castId)?.color : undefined))
  if (!fit) return null
  return (
    <>
      <MannequinView node={node} selected={selected} clickable={clickable} passive={passive} clay={clay} ghost fitted={fit.proportions} />
      <HumanView fit={fit} pose={node.pose} color={castColor ?? node.color} appearance={node.appearance} selected={selected} />
    </>
  )
}
