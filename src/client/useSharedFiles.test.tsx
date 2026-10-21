import React from 'react'
import { renderHook } from '@testing-library/react-native'

import { buildByIdMap, SharingContext } from '@/sharing/SharingProvider'
import { PublicLinkPermission, SharingDoc } from '@/files/sharing'
import { SharedScope, useSharedFileIds } from './useSharedFiles'

const sharing = (id: string, owner: boolean): SharingDoc => ({
  _id: id,
  attributes: { active: true, owner, rules: [{ doctype: 'io.cozy.files', values: [id] }] }
})

const link: PublicLinkPermission = {
  _id: 'p1',
  attributes: { permissions: { rule0: { type: 'io.cozy.files', values: ['link-only', 'theirs'] } } }
}

const byId = buildByIdMap([sharing('mine', true), sharing('theirs', false)], [link])

const idsFor = (scope: SharedScope): string[] =>
  renderHook(() => useSharedFileIds(scope), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <SharingContext.Provider
        value={{ loaded: true, byId, sharings: [], refresh: () => Promise.resolve() }}
      >
        {children}
      </SharingContext.Provider>
    )
  }).result.current.ids

describe('useSharedFileIds', () => {
  it('lists a file shared by public link only under by-me', () => {
    expect(idsFor('by-me')).toEqual(['link-only', 'mine'])
    expect(idsFor('with-me')).toEqual(['theirs'])
  })
})
