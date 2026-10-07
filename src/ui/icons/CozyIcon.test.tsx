import React from 'react'
import { render } from '@testing-library/react-native'
import { Path } from 'react-native-svg'
import { CozyIcon } from './CozyIcon'
import { ICONS } from './registry'

test('le registre contient les icônes de base', () => {
  expect(ICONS.star).toBeDefined()
  expect(ICONS.cloud2.viewBox).toBe('0 0 16 16')
})

test('CozyIcon rend une icône connue sans planter', () => {
  const { UNSAFE_root } = render(<CozyIcon name="star" size={24} color="#3b82f7" />)
  expect(UNSAFE_root).toBeTruthy()
})

test('un glyphe tracé prend la couleur de l’icône pour son trait, sans remplissage', () => {
  const { UNSAFE_getByType } = render(<CozyIcon name="infoOutline" size={20} color="#112233" />)
  const path = UNSAFE_getByType(Path)
  expect(path.props.stroke).toBe('#112233')
  expect(path.props.fill).toBe('none')
})

test('les variantes outline demandées existent', () => {
  for (const k of ['cloudOutline', 'infoOutline', 'downloadOutline']) {
    expect(ICONS[k].paths.every(p => p.fill === 'none' && p.stroke === 'currentColor')).toBe(true)
  }
})

test('CozyIcon renvoie null pour une icône inconnue', () => {
  const { toJSON } = render(<CozyIcon name="__nope__" />)
  expect(toJSON()).toBeNull()
})
