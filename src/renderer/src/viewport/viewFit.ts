import { MathUtils } from 'three'
import { frameIn, guideLabel, guideRatio, imageSize, type CameraOptics } from '../../../shared/camera'

// Fitting a shot camera's image into the viewport when looking through it. The whole
// de-squeezed sensor image is shown with a margin; the delivery frame and guides are
// rectangles inside it. The render camera's field of view is widened to match.

const MARGIN = 0.9 // the image fills 90% of the viewport in its tighter direction

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewFit {
  /** Vertical field of view for the render camera (degrees). */
  verticalFov: number
  image: Rect
  delivery: Rect
  guides: { id: string; label: string; rect: Rect }[]
  /** Screen pixels per millimetre of sensor height. */
  pxPerMm: number
}

export function viewFit(camera: CameraOptics & { guides: string[] }, width: number, height: number): ViewFit {
  const img = imageSize(camera)
  const imageRatio = img.width / img.height
  const viewRatio = width / Math.max(1, height)
  // How tall the image is, as a fraction of the viewport height.
  const heightFraction = imageRatio > viewRatio ? (MARGIN * viewRatio) / imageRatio : MARGIN
  const imageFov = 2 * Math.atan(img.height / (2 * camera.focalLength))
  const verticalFov = MathUtils.radToDeg(2 * Math.atan(Math.tan(imageFov / 2) / heightFraction))

  const imageHeightPx = heightFraction * height
  const pxPerMm = imageHeightPx / img.height
  const rectFor = (ratio: number | null): Rect => {
    const f = frameIn(img, ratio)
    const w = f.width * pxPerMm
    const h = f.height * pxPerMm
    return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h }
  }

  return {
    verticalFov,
    pxPerMm,
    image: rectFor(null),
    delivery: rectFor(camera.delivery === 'sensor' ? null : guideRatio(camera.delivery)),
    guides: camera.guides
      .filter((g) => guideRatio(g) !== null)
      .map((g) => ({ id: g, label: guideLabel(g), rect: rectFor(guideRatio(g)) }))
  }
}
