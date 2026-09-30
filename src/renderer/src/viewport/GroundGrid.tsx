import { Grid } from '@react-three/drei'
import { useUi } from '../state/uiStore'
import { gridSpacing } from '../units'

// Floor grid in real-world units: metres (1 m / 10 m) or feet (1 ft / 10 ft).
export default function GroundGrid() {
  const units = useUi((s) => s.units)
  const { cell, section } = gridSpacing(units)
  return (
    <Grid
      // A hair below the floor so floor planes cover it instead of flickering against it.
      position={[0, -0.003, 0]}
      infiniteGrid
      cellSize={cell}
      cellThickness={1}
      cellColor="#4a4d55"
      sectionSize={section}
      sectionThickness={1.2}
      sectionColor="#5d6068"
      fadeDistance={120}
      fadeStrength={1.5}
    />
  )
}
