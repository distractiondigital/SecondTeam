import { useMemo } from 'react'
import { proportions } from '../../../shared/mannequin'
import type { MannequinNode } from '../../../shared/project'
import { useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import HumanView from './HumanView'
import { useBodyData, useFigureLoading } from './humanData'
import MannequinView from './MannequinView'
import { fitFor, useEffectivePose } from './figurePose'

const FALLBACK = proportions(1.75, 0.5)

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
  // Rebuilt when any body slider (all of them, chest included), the height or the expression changes.
  const bodyKey = JSON.stringify(node.body)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fit = useMemo(() => (data ? fitFor(data, node) : null), [data, bodyKey, node.height, node.expression])
  // Planted hands/feet and look-at, worked out on the body's own proportions.
  const pose = useEffectivePose(fit ? node : null, fit?.proportions ?? FALLBACK)
  // A figure linked to a cast member wears that cast member's colour.
  // The Figure colours switch is for the viewport only: thumbnails, the board and exports stay natural.
  const overlay = useUi((s) => s.figureColors)
  const castColor = useDocument((s) => (node.castId ? s.project.cast.find((c) => c.id === node.castId)?.color : undefined))
  // (Until the body has loaded, the figure isn't there yet: pictures wait.)
  useFigureLoading(!fit)
  if (!fit) return null
  return (
    <>
      <MannequinView node={node} selected={selected} clickable={clickable} passive={passive} clay={clay} ghost fitted={fit.proportions} posed={pose ?? node.pose} />
      <HumanView fit={fit} pose={pose ?? node.pose} coloring={!passive && overlay ? 'overlay' : 'natural'} hands={node.hands} color={castColor ?? node.color} appearance={node.appearance} selected={selected} />
    </>
  )
}
