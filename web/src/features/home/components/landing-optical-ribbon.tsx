/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useLayoutEffect, useRef, useState } from 'react'

import '@/styles/lftech-home-ribbons.css'

interface LandingOpticalRibbonProps {
  headingId: string
  transitionSource?: boolean
}

// CSS owns drawing and continuous movement. JS only follows layout and visibility.
export function LandingOpticalRibbon(props: LandingOpticalRibbonProps) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const laneRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)

  useLayoutEffect(() => {
    const section = fieldRef.current?.closest('section')
    const lane = laneRef.current
    const heading = document.getElementById(props.headingId)
    if (
      !section ||
      !lane ||
      !heading ||
      typeof IntersectionObserver === 'undefined' ||
      typeof ResizeObserver === 'undefined'
    ) {
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    const updatePlayback = () => {
      setActive(visible && !document.hidden && !reducedMotion.matches)
    }
    const position = () => {
      const headingBounds = heading.getBoundingClientRect()
      const sectionBounds = section.getBoundingClientRect()
      lane.style.setProperty(
        '--lane-top',
        `${headingBounds.top - sectionBounds.top + headingBounds.height / 2}px`
      )
    }
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      updatePlayback()
    })
    const resize = new ResizeObserver(position)
    position()
    resize.observe(section)
    resize.observe(heading)
    intersection.observe(lane)
    document.addEventListener('visibilitychange', updatePlayback)
    reducedMotion.addEventListener('change', updatePlayback)
    return () => {
      intersection.disconnect()
      resize.disconnect()
      document.removeEventListener('visibilitychange', updatePlayback)
      reducedMotion.removeEventListener('change', updatePlayback)
    }
  }, [props.headingId])

  return (
    <div ref={fieldRef} className='lf-optical-light' aria-hidden='true'>
      <div
        ref={laneRef}
        className='lf-optical-lane'
        data-playing={active}
        data-lf-ribbon-anchor={props.transitionSource ? 'home' : undefined}
      >
        <div className='lf-optical-track'>
          {[0, 1].map((tile) => (
            <div className='lf-optical-tile' key={tile}>
              <span className='lf-optical-surface' />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
